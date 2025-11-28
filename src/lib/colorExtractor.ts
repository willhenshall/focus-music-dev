export function extractDominantColor(imageUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        resolve('#4B5563');
        return;
      }

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        const colorMap: { [key: string]: number } = {};

        for (let i = 0; i < data.length; i += 4) {
          const r = Math.floor(data[i] / 10) * 10;
          const g = Math.floor(data[i + 1] / 10) * 10;
          const b = Math.floor(data[i + 2] / 10) * 10;

          if (r > 240 && g > 240 && b > 240) continue;
          if (r < 15 && g < 15 && b < 15) continue;

          const key = `${r},${g},${b}`;
          colorMap[key] = (colorMap[key] || 0) + 1;
        }

        let dominantColor = '75,85,99';
        let maxCount = 0;

        for (const [color, count] of Object.entries(colorMap)) {
          if (count > maxCount) {
            maxCount = count;
            dominantColor = color;
          }
        }

        resolve(`rgb(${dominantColor})`);
      } catch (e) {
        resolve('#4B5563');
      }
    };

    img.onerror = () => {
      resolve('#4B5563');
    };

    img.src = imageUrl;
  });
}

export function getTextColor(backgroundColor: string): string {
  const rgb = backgroundColor.match(/\d+/g);
  if (!rgb || rgb.length < 3) return '#ffffff';

  const r = parseInt(rgb[0]);
  const g = parseInt(rgb[1]);
  const b = parseInt(rgb[2]);

  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.5 ? '#1e293b' : '#ffffff';
}
