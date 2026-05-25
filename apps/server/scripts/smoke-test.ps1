# End-to-end smoke test for the chunked-upload API.
# Boots a synthetic 2.5 MiB JPEG, runs init -> chunks -> status -> finalize,
# verifies dedup and two negative paths. Requires the server to be running.
#
# Usage:
#   pwsh scripts/smoke-test.ps1
#   pwsh scripts/smoke-test.ps1 -BaseUrl http://127.0.0.1:8000 -UserId smoke-user

param(
    [string]$BaseUrl = "http://127.0.0.1:8000",
    [string]$UserId  = "smoke-user"
)

$ErrorActionPreference = "Stop"
$ChunkSize = 1048576

function Send-Chunk($url, $bytes) {
    $tmp = [System.IO.Path]::GetTempFileName()
    [System.IO.File]::WriteAllBytes($tmp, $bytes)
    try {
        $r = Invoke-WebRequest -Uri $url -Method PUT `
            -Headers @{ "X-User-Id" = $UserId; "Content-Type" = "application/octet-stream" } `
            -InFile $tmp -UseBasicParsing
        return $r.Content | ConvertFrom-Json
    } finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
}

Write-Host "[1] Building 2.5 MiB synthetic JPEG" -ForegroundColor Cyan
$jpegHeader = [byte[]]@(0xFF,0xD8,0xFF,0xE0,0x00,0x10,0x4A,0x46,0x49,0x46,0x00,0x01,0x01,0x00,0x00,0x01,0x00,0x01,0x00,0x00)
$jpegFooter = [byte[]]@(0xFF,0xD9)
$payloadSize = [int]($ChunkSize * 2.5)
$padding = New-Object byte[] ($payloadSize - $jpegHeader.Length - $jpegFooter.Length)
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($padding)
$payload = New-Object byte[] $payloadSize
[Array]::Copy($jpegHeader, 0, $payload, 0, $jpegHeader.Length)
[Array]::Copy($padding, 0, $payload, $jpegHeader.Length, $padding.Length)
[Array]::Copy($jpegFooter, 0, $payload, $payloadSize - $jpegFooter.Length, $jpegFooter.Length)
$expectedMd5 = ([System.Security.Cryptography.MD5]::Create().ComputeHash($payload) | ForEach-Object { $_.ToString("x2") }) -join ""
$totalChunks = [Math]::Ceiling($payloadSize / $ChunkSize)
Write-Host "    size=$payloadSize totalChunks=$totalChunks md5=$expectedMd5" -ForegroundColor Gray

Write-Host "[2] POST /api/uploads/init" -ForegroundColor Cyan
$init = Invoke-RestMethod -Uri "$BaseUrl/api/uploads/init" -Method POST `
    -Headers @{ "X-User-Id" = $UserId; "Content-Type" = "application/json" } `
    -Body (@{ filename = "smoke.jpg"; size = $payloadSize; mimeType = "image/jpeg"; totalChunks = $totalChunks } | ConvertTo-Json -Compress)
$uploadId = $init.uploadId
Write-Host "    uploadId=$uploadId chunkSize=$($init.chunkSize)" -ForegroundColor Green

for ($i = 0; $i -lt $totalChunks; $i++) {
    Write-Host "[3.$i] PUT chunks/$i" -ForegroundColor Cyan
    $start = $i * $ChunkSize
    $end = [Math]::Min($start + $ChunkSize, $payloadSize) - 1
    $chunkBytes = $payload[$start..$end]
    $resp = Send-Chunk "$BaseUrl/api/uploads/$uploadId/chunks/$i" $chunkBytes
    Write-Host "    received=$($resp.receivedChunks)/$($resp.totalChunks) (bytes=$($chunkBytes.Length))" -ForegroundColor Green
}

Write-Host "[4] GET status" -ForegroundColor Cyan
$status = Invoke-RestMethod -Uri "$BaseUrl/api/uploads/$uploadId/status" -Method GET -Headers @{ "X-User-Id" = $UserId }
Write-Host "    status=$($status.status) uploadedChunks=[$($status.uploadedChunks -join ',')]" -ForegroundColor Green

Write-Host "[5] POST finalize" -ForegroundColor Cyan
$final = Invoke-RestMethod -Uri "$BaseUrl/api/uploads/$uploadId/finalize" -Method POST `
    -Headers @{ "X-User-Id" = $UserId; "Content-Type" = "application/json" } `
    -Body (@{ md5 = $expectedMd5 } | ConvertTo-Json -Compress)
Write-Host "    fileId=$($final.fileId)"      -ForegroundColor Green
Write-Host "    url=$($final.url)"             -ForegroundColor Green
Write-Host "    deduplicated=$($final.deduplicated)" -ForegroundColor Green

Write-Host "[6] Re-upload same payload (expect dedup)" -ForegroundColor Cyan
$init2 = Invoke-RestMethod -Uri "$BaseUrl/api/uploads/init" -Method POST `
    -Headers @{ "X-User-Id" = $UserId; "Content-Type" = "application/json" } `
    -Body (@{ filename = "dup.jpg"; size = $payloadSize; mimeType = "image/jpeg"; totalChunks = $totalChunks } | ConvertTo-Json -Compress)
$id2 = $init2.uploadId
for ($i = 0; $i -lt $totalChunks; $i++) {
    $start = $i * $ChunkSize
    $end = [Math]::Min($start + $ChunkSize, $payloadSize) - 1
    Send-Chunk "$BaseUrl/api/uploads/$id2/chunks/$i" $payload[$start..$end] | Out-Null
}
$dup = Invoke-RestMethod -Uri "$BaseUrl/api/uploads/$id2/finalize" -Method POST `
    -Headers @{ "X-User-Id" = $UserId; "Content-Type" = "application/json" } `
    -Body (@{ md5 = $expectedMd5 } | ConvertTo-Json -Compress)
Write-Host "    deduplicated=$($dup.deduplicated) (expected True)" -ForegroundColor Green

Write-Host "[7] Negative: missing X-User-Id" -ForegroundColor Cyan
try {
    Invoke-RestMethod -Uri "$BaseUrl/api/uploads/init" -Method POST `
        -Headers @{ "Content-Type" = "application/json" } `
        -Body '{"filename":"x.jpg","size":100,"mimeType":"image/jpeg","totalChunks":1}'
    Write-Host "    ERROR: expected 401" -ForegroundColor Red
} catch {
    Write-Host "    got $($_.Exception.Response.StatusCode.value__) (expected 401)" -ForegroundColor Green
}

Write-Host "[8] Negative: declared image but body is text (magic-number reject)" -ForegroundColor Cyan
$initBad = Invoke-RestMethod -Uri "$BaseUrl/api/uploads/init" -Method POST `
    -Headers @{ "X-User-Id" = $UserId; "Content-Type" = "application/json" } `
    -Body '{"filename":"fake.jpg","size":100,"mimeType":"image/jpeg","totalChunks":1}'
$textBytes = [System.Text.Encoding]::ASCII.GetBytes("This is plain text content. Not an image at all.")
try {
    Send-Chunk "$BaseUrl/api/uploads/$($initBad.uploadId)/chunks/0" $textBytes | Out-Null
    Write-Host "    ERROR: expected 415" -ForegroundColor Red
} catch {
    Write-Host "    got $($_.Exception.Response.StatusCode.value__) (expected 415)" -ForegroundColor Green
}

Write-Host ""
Write-Host "All checks passed." -ForegroundColor Green
