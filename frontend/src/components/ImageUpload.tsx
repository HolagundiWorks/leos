import { useRef, useState } from 'react';
import { ActionIcon, Button, Group, Image, Stack, Text } from '@mantine/core';
import { ImageOff, Upload, X } from 'lucide-react';

interface Props {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  label: string;
  /** Shown under the control, e.g. "Recommended 400×400 px, PNG, under 200 KB". */
  guideline: string;
  /** Longest-edge cap; the image is downscaled to this before encoding. */
  maxDim?: number;
  output?: 'png' | 'jpeg';
  /** Preview backdrop (useful for transparent logos/signatures). */
  previewBg?: string;
  height?: number;
}

// Read a file, downscale to maxDim (longest edge), and return a base64 data URL.
function processFile(file: File, maxDim: number, output: 'png' | 'jpeg'): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error('not an image'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('canvas unavailable'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL(output === 'jpeg' ? 'image/jpeg' : 'image/png', 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

const kb = (dataUrl: string) => Math.round((dataUrl.length * 0.75) / 1024);

export function ImageUpload({
  value, onChange, label, guideline, maxDim = 512, output = 'png', previewBg = '#fff', height = 90,
}: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file?: File) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith('image/')) { setError('Please choose an image file.'); return; }
    try {
      let url = await processFile(file, maxDim, output);
      // Keep the DB lean; if a PNG is still large, fall back to JPEG.
      if (kb(url) > 600 && output === 'png') url = await processFile(file, maxDim, 'jpeg');
      onChange(url);
    } catch {
      setError('Could not read that image.');
    }
  };

  return (
    <Stack gap={4}>
      <Text size="sm" fw={500}>{label}</Text>
      <Group gap="sm" align="center">
        {value ? (
          <div style={{ background: previewBg, borderRadius: 8, padding: 6, border: '1px solid var(--mantine-color-gray-3)' }}>
            <Image src={value} h={height} w="auto" fit="contain" alt={label} />
          </div>
        ) : (
          <div style={{ height: height + 12, width: height + 12, borderRadius: 8, border: '1px dashed var(--mantine-color-gray-4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mantine-color-gray-5)' }}>
            <ImageOff size={22} />
          </div>
        )}
        <Stack gap={4}>
          <Group gap="xs">
            <Button size="compact-sm" variant="light" leftSection={<Upload size={14} />} onClick={() => ref.current?.click()}>
              {value ? 'Replace' : 'Upload'}
            </Button>
            {value && (
              <ActionIcon variant="subtle" color="red" onClick={() => onChange(null)} title="Remove">
                <X size={16} />
              </ActionIcon>
            )}
          </Group>
          <Text size="xs" c="dimmed">{guideline}{value ? ` · ~${kb(value)} KB` : ''}</Text>
        </Stack>
      </Group>
      {error && <Text size="xs" c="red">{error}</Text>}
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => { void pick(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }}
      />
    </Stack>
  );
}
