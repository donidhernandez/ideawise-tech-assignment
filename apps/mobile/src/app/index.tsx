import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { UploadItemCard } from '@/components/upload-item';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useUpload } from '@/hooks/use-upload';
import { env } from '@/lib/env';
import { useUploadStore } from '@/store/uploadStore';

const MAX_FILES = 10;

export default function UploadScreen() {
  const theme = useTheme();
  const items = useUploadStore((s) => s.items);
  const { startUpload } = useUpload();
  const [picking, setPicking] = useState(false);

  const completedCount = items.filter((i) => i.status === 'complete').length;
  const activeCount = items.filter(
    (i) => i.status === 'uploading' || i.status === 'initializing' || i.status === 'finalizing'
  ).length;
  const totalBytes = items.reduce((s, i) => s + i.size, 0);
  const uploadedBytes = items.reduce((s, i) => s + i.uploadedBytes, 0);
  const globalPct = totalBytes === 0 ? 0 : Math.round((uploadedBytes / totalBytes) * 100);

  const pickFromLibrary = async () => {
    if (picking) return;
    setPicking(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow photo library access to pick files.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        selectionLimit: Math.max(1, MAX_FILES - items.length),
        quality: 1,
      });
      if (result.canceled) return;
      for (const a of result.assets) startUpload(a);
    } catch (e) {
      Alert.alert('Picker error', e instanceof Error ? e.message : String(e));
    } finally {
      setPicking(false);
    }
  };

  const takePhoto = async () => {
    if (picking) return;
    setPicking(true);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow camera access to capture photos.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images', 'videos'],
        quality: 1,
      });
      if (result.canceled) return;
      for (const a of result.assets) startUpload(a);
    } catch (e) {
      Alert.alert('Camera error', e instanceof Error ? e.message : String(e));
    } finally {
      setPicking(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: BottomTabInset + Spacing.five },
          ]}>
          <View style={styles.header}>
            <ThemedText type="subtitle">Media uploader</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Chunked uploads · pause / resume · dedup
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              API: <ThemedText type="code">{env.apiUrl}</ThemedText>
            </ThemedText>
          </View>

          <View style={styles.buttonRow}>
            <PrimaryButton label="Pick from library" onPress={pickFromLibrary} disabled={picking} />
            <SecondaryButton
              label="Take photo / video"
              onPress={takePhoto}
              disabled={picking}
              theme={theme}
            />
          </View>

          {items.length > 0 && (
            <ThemedView type="backgroundElement" style={styles.queueHeader}>
              <View style={styles.queueHeaderRow}>
                <ThemedText type="smallBold">
                  Queue · {items.length} {items.length === 1 ? 'file' : 'files'}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {completedCount} complete · {activeCount} active · {globalPct}%
                </ThemedText>
              </View>
              <View style={[styles.queueProgressTrack, { backgroundColor: theme.backgroundSelected }]}>
                <View
                  style={[
                    styles.queueProgressFill,
                    { width: `${globalPct}%`, backgroundColor: '#7c3aed' },
                  ]}
                />
              </View>
            </ThemedView>
          )}

          <View style={styles.list}>
            {items.length === 0 ? (
              <ThemedView type="backgroundElement" style={styles.emptyState}>
                <ThemedText type="small" themeColor="textSecondary">
                  No uploads yet. Pick a file or take a photo to get started.
                </ThemedText>
              </ThemedView>
            ) : (
              items.map((item) => <UploadItemCard key={item.localId} item={item} />)
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function PrimaryButton({
  label, onPress, disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        styles.btnPrimary,
        pressed && { opacity: 0.85 },
        disabled && { opacity: 0.5 },
      ]}>
      <ThemedText type="smallBold" style={{ color: '#ffffff' }}>{label}</ThemedText>
    </Pressable>
  );
}

function SecondaryButton({
  label, onPress, disabled, theme,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: theme.backgroundElement },
        pressed && { opacity: 0.85 },
        disabled && { opacity: 0.5 },
      ]}>
      <ThemedText type="smallBold">{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    alignSelf: 'stretch',
  },
  header: { gap: Spacing.one, paddingVertical: Spacing.two },
  buttonRow: { flexDirection: 'row', gap: Spacing.two },
  btn: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: { backgroundColor: '#7c3aed' },
  queueHeader: { padding: Spacing.three, borderRadius: Spacing.two, gap: Spacing.two },
  queueHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  queueProgressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  queueProgressFill: { height: '100%' },
  list: { gap: Spacing.two },
  emptyState: { padding: Spacing.four, borderRadius: Spacing.two, alignItems: 'center' },
});
