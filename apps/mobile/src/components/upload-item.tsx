import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useUpload } from '@/hooks/use-upload';
import type { UploadItem as UploadItemModel } from '@/store/uploadStore';

interface Props {
  item: UploadItemModel;
}

const STATUS_LABEL: Record<UploadItemModel['status'], string> = {
  idle: 'Idle',
  initializing: 'Initializing…',
  uploading: 'Uploading',
  paused: 'Paused',
  finalizing: 'Finalizing',
  complete: 'Complete',
  failed: 'Failed',
  canceled: 'Canceled',
};

const ACTIVE_STATUSES = new Set<UploadItemModel['status']>([
  'idle', 'initializing', 'uploading', 'paused',
]);
const TERMINAL_STATUSES = new Set<UploadItemModel['status']>([
  'complete', 'failed', 'canceled',
]);

export function UploadItemCard({ item }: Props) {
  const theme = useTheme();
  const { pause, resume, cancel, remove } = useUpload();
  const percent = Math.round(item.ratio * 100);
  const isImage = item.mimeType.startsWith('image/');

  const barColor =
    item.status === 'failed' ? '#ef4444' :
    item.status === 'complete' ? '#10b981' :
    item.status === 'paused' ? '#f59e0b' : '#7c3aed';

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.row}>
        {isImage ? (
          <Image source={{ uri: item.sourceUri }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={[styles.thumb, styles.videoThumb]}>
            <ThemedText type="smallBold" themeColor="text">VID</ThemedText>
          </View>
        )}

        <View style={styles.metaCol}>
          <View style={styles.headerRow}>
            <ThemedText type="smallBold" numberOfLines={1} style={styles.name}>
              {item.name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {item.deduplicated && item.status === 'complete'
                ? 'Deduplicated'
                : STATUS_LABEL[item.status]}
            </ThemedText>
          </View>

          <ThemedText type="small" themeColor="textSecondary">
            {formatBytes(item.uploadedBytes)} / {formatBytes(item.size)} · {percent}%
          </ThemedText>

          <View style={[styles.progressTrack, { backgroundColor: theme.backgroundSelected }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${percent}%`, backgroundColor: barColor },
              ]}
            />
          </View>

          {item.error && item.status === 'failed' && (
            <ThemedText type="small" style={styles.error}>{item.error}</ThemedText>
          )}
        </View>
      </View>

      <View style={styles.actions}>
        {ACTIVE_STATUSES.has(item.status) && item.status !== 'paused' && (
          <ActionButton label="Pause" onPress={() => pause(item.localId)} />
        )}
        {item.status === 'paused' && (
          <ActionButton label="Resume" variant="primary" onPress={() => resume(item.localId)} />
        )}
        {ACTIVE_STATUSES.has(item.status) && (
          <ActionButton label="Cancel" variant="danger" onPress={() => void cancel(item.localId)} />
        )}
        {TERMINAL_STATUSES.has(item.status) && (
          <ActionButton label="Remove" onPress={() => remove(item.localId)} />
        )}
      </View>
    </ThemedView>
  );
}

function ActionButton({
  label, onPress, variant = 'default',
}: {
  label: string;
  onPress: () => void;
  variant?: 'default' | 'primary' | 'danger';
}) {
  const theme = useTheme();
  const colors = {
    default: { bg: theme.backgroundSelected, fg: theme.text },
    primary: { bg: '#7c3aed', fg: '#ffffff' },
    danger: { bg: 'transparent', fg: '#ef4444' },
  }[variant];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionBtn,
        { backgroundColor: colors.bg },
        pressed && { opacity: 0.7 },
        variant === 'danger' && { borderColor: '#ef4444', borderWidth: 1 },
      ]}>
      <ThemedText type="smallBold" style={{ color: colors.fg }}>{label}</ThemedText>
    </Pressable>
  );
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.three,
  },
  row: { flexDirection: 'row', gap: Spacing.three },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: Spacing.one,
    backgroundColor: '#cccccc',
  },
  videoThumb: { alignItems: 'center', justifyContent: 'center' },
  metaCol: { flex: 1, gap: Spacing.one },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  name: { flex: 1 },
  progressTrack: {
    marginTop: Spacing.one,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3 },
  error: { color: '#ef4444' },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
  actionBtn: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.one,
  },
});
