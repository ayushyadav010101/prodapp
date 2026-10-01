"use client";

interface ShareCardOptions {
  eyebrow: string;
  title: string;
  statLine: string;
  progressPercent?: number;
  footer: string;
  userName?: string;
  avatarUrl?: string;
  level?: number;
  items?: { title: string; completed: boolean }[];
}

const WIDTH = 1080;
const BASE_HEIGHT = 1080;

export async function generateShareCard(opts: ShareCardOptions): Promise<Blob | null> {
  const itemCount = opts.items?.length ?? 0;
  const HEIGHT = Math.max(BASE_HEIGHT, 930 + itemCount * 64);
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#17140f";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glow = ctx.createRadialGradient(150, 120, 0, 150, 120, 650);
  glow.addColorStop(0, "rgba(224,138,95,0.26)");
  glow.addColorStop(1, "rgba(224,138,95,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const margin = 86;
  let y = 110;

  // Large profile header — intentionally much more visible than the old footer avatar.
  if (opts.userName) {
    ctx.fillStyle = "rgba(236,231,217,0.08)";
    roundRect(ctx, margin, y, WIDTH - margin * 2, 164, 36);
    ctx.fill();

    const avatarX = margin + 68;
    const avatarY = y + 82;
    if (opts.avatarUrl) {
      try {
        const avatar = new Image();
        avatar.crossOrigin = "anonymous";
        await new Promise<void>((resolve, reject) => {
          avatar.onload = () => resolve();
          avatar.onerror = () => reject(new Error("Avatar could not be loaded"));
          avatar.src = opts.avatarUrl!;
        });
        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX, avatarY, 51, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(avatar, avatarX - 51, avatarY - 51, 102, 102);
        ctx.restore();
      } catch {
        drawPixelAvatar(ctx, avatarX, avatarY, 102);
      }
    } else {
      drawPixelAvatar(ctx, avatarX, avatarY, 102);
    }

    ctx.textAlign = "left";
    ctx.fillStyle = "#ece7d9";
    ctx.font = "700 40px Georgia, serif";
    ctx.fillText(opts.userName, margin + 150, y + 70);
    ctx.fillStyle = "#a89e8a";
    ctx.font = "600 27px Arial, sans-serif";
    ctx.fillText(typeof opts.level === "number" ? `LEVEL ${opts.level}` : "CONFLICT-CALENDAR", margin + 150, y + 114);
    y += 210;
  }

  ctx.fillStyle = "#e08a5f";
  ctx.font = "700 26px Arial, sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(opts.eyebrow.toUpperCase(), margin, y);

  y += 100;
  ctx.fillStyle = "#ece7d9";
  ctx.font = "700 74px Georgia, serif";
  const maxWidth = WIDTH - margin * 2;
  const lines: string[] = [];
  let line = "";
  for (const word of opts.title.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  for (const l of lines.slice(0, 3)) {
    ctx.fillText(l, margin, y);
    y += 86;
  }

  y += 20;
  ctx.fillStyle = "#a89e8a";
  ctx.font = "400 36px Arial, sans-serif";
  ctx.fillText(opts.statLine, margin, y);

  if (typeof opts.progressPercent === "number") {
    y += 72;
    const barW = WIDTH - margin * 2;
    const barH = 24;
    ctx.fillStyle = "rgba(236,231,217,0.14)";
    roundRect(ctx, margin, y, barW, barH, 12);
    ctx.fill();
    ctx.fillStyle = "#e08a5f";
    const filled = Math.max(barH, (Math.min(100, Math.max(0, opts.progressPercent)) / 100) * barW);
    roundRect(ctx, margin, y, filled, barH, 12);
    ctx.fill();

    ctx.fillStyle = "#ece7d9";
    ctx.font = "700 28px Arial, sans-serif";
    ctx.fillText(`${Math.round(opts.progressPercent)}% COMPLETE`, margin, y + 62);
    y += 108;
  }

  if (opts.items?.length) {
    ctx.fillStyle = "#a89e8a";
    ctx.font = "700 24px Arial, sans-serif";
    ctx.fillText("TASKS", margin, y);
    y += 28;

    for (const item of opts.items) {
      y += 18;
      const rowH = 54;
      ctx.fillStyle = "rgba(236,231,217,0.07)";
      roundRect(ctx, margin, y, WIDTH - margin * 2, rowH, 14);
      ctx.fill();

      const boxX = margin + 18;
      const boxY = y + 13;
      ctx.strokeStyle = item.completed ? "#e08a5f" : "#6b6355";
      ctx.lineWidth = 3;
      ctx.strokeRect(boxX, boxY, 25, 25);
      if (item.completed) {
        ctx.strokeStyle = "#e08a5f";
        ctx.beginPath();
        ctx.moveTo(boxX + 5, boxY + 13);
        ctx.lineTo(boxX + 11, boxY + 19);
        ctx.lineTo(boxX + 21, boxY + 7);
        ctx.stroke();
      }

      ctx.fillStyle = item.completed ? "#8f8879" : "#ece7d9";
      ctx.font = "600 25px Arial, sans-serif";
      const maxTitle = WIDTH - margin * 2 - 85;
      let title = item.title || "(Untitled task)";
      while (ctx.measureText(title).width > maxTitle && title.length > 4) title = title.slice(0, -4) + "…";
      ctx.fillText(title, margin + 62, y + 35);
      y += rowH;
    }
  }

  ctx.fillStyle = "#6b6355";
  ctx.font = "400 28px Arial, sans-serif";
  ctx.fillText(opts.footer, margin, HEIGHT - 60);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

function drawPixelAvatar(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, size: number) {
  const x = centerX - size / 2;
  const y = centerY - size / 2;
  const u = size / 64;
  const rect = (rx: number, ry: number, rw: number, rh: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x + rx * u, y + ry * u, rw * u, rh * u);
  };

  rect(7, 7, 50, 50, "#efe6cf");
  rect(18, 14, 28, 8, "#d78a35");
  rect(14, 20, 36, 21, "#e7a64d");
  rect(18, 24, 7, 6, "#3e342a");
  rect(39, 24, 7, 6, "#3e342a");
  rect(25, 32, 14, 5, "#c16e3a");
  rect(18, 40, 28, 11, "#6f7274");
  rect(22, 39, 20, 4, "#8b8f91");
  rect(14, 44, 6, 7, "#4b4d4f");
  rect(44, 44, 6, 7, "#4b4d4f");
  rect(25, 43, 14, 8, "#74787a");

  ctx.strokeStyle = "rgba(236,231,217,0.7)";
  ctx.lineWidth = 2 * u;
  ctx.strokeRect(x + 7 * u, y + 7 * u, 50 * u, 50 * u);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function shareOrDownload(blob: Blob, filename: string, text: string) {
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return;
    } catch {
      // cancelled/failed -> download below
    }
  }
  downloadBlob(blob, filename);
}
