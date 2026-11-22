// Locally drawn test pictures, so no real video or broadcast content is involved.
const BARS = ['#c8c8c8', '#c8c800', '#00c8c8', '#00c800', '#c800c8', '#c80000', '#0000c8'];

export function drawSource(ctx, w, h, kind, t) {
  if (kind === 'carrier') {
    BARS.forEach((color, i) => { ctx.fillStyle = color; ctx.fillRect((i * w) / 7, 0, w / 7 + 1, h * 0.72); });
    ctx.fillStyle = '#12202a';
    ctx.fillRect(0, h * 0.72, w, h * 0.28);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(w * (0.5 + 0.42 * Math.sin(t * 1.3)), h * 0.36, h * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `bold ${Math.round(h * 0.13)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('SATLAB CH 1', w / 2, h * 0.91);
    return;
  }
  ctx.fillStyle = '#2a0f1f';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#d0559a';
  ctx.lineWidth = Math.max(2, h * 0.025);
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.42, ((t * 0.35 + i / 4) % 1) * h * 0.6, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(h * 0.13)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('SIMULATED OVERLAY', w / 2, h * 0.9);
}

function message(ctx, w, h, text, background) {
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#dbe5ea';
  ctx.font = `bold ${Math.round(h * 0.11)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(text, w / 2, h / 2 + h * 0.04);
}

// Decoder errors damage whole blocks of the picture, which is why satellite video breaks up in squares.
function corrupt(ctx, w, h, errors) {
  const size = Math.max(6, Math.round(w / 20));
  for (let y = 0; y < h; y += size) {
    for (let x = 0; x < w; x += size) {
      if (Math.random() >= errors) continue;
      const fromX = Math.floor(Math.random() * Math.max(1, w - size)), fromY = Math.floor(Math.random() * Math.max(1, h - size));
      ctx.drawImage(ctx.canvas, fromX, fromY, size, size, x, y, size, size);
      if (Math.random() < 0.3) { ctx.fillStyle = 'rgba(40,160,90,.55)'; ctx.fillRect(x, y, size, size); }
    }
  }
}

export function createDecoder(canvas) {
  const ctx = canvas.getContext('2d');
  let hasFrame = false;
  return (video, t) => {
    const w = canvas.width, h = canvas.height;
    if (video.mode === 'frozen' && hasFrame) { corrupt(ctx, w, h, 0.06); return; }
    if (video.mode === 'none' || video.mode === 'frozen') { message(ctx, w, h, 'NO SIGNAL', '#0a0f14'); hasFrame = false; return; }
    if (video.mode === 'blocked') { message(ctx, w, h, 'BLOCKED: NOT AUTHENTIC', '#3a1f1d'); hasFrame = false; return; }
    drawSource(ctx, w, h, video.mode, t);
    if (video.errors > 0) corrupt(ctx, w, h, video.errors);
    hasFrame = true;
  };
}
