<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20260525083751 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql('CREATE TABLE uploads (id BLOB NOT NULL, filename VARCHAR(255) NOT NULL, mime_type VARCHAR(127) NOT NULL, size BIGINT NOT NULL, total_chunks INTEGER NOT NULL, received_chunks INTEGER DEFAULT 0 NOT NULL, status VARCHAR(16) DEFAULT \'pending\' NOT NULL, md5_hash VARCHAR(32) DEFAULT NULL, user_id VARCHAR(128) NOT NULL, storage_path VARCHAR(512) DEFAULT NULL, created_at DATETIME NOT NULL, finalized_at DATETIME DEFAULT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE INDEX idx_uploads_md5 ON uploads (md5_hash)');
        $this->addSql('CREATE INDEX idx_uploads_status_created ON uploads (status, created_at)');
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql('DROP TABLE uploads');
    }
}
