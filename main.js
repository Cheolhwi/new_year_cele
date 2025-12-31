/*
 * Main JavaScript for the 9‑Grid Poster Composer.
 *
 * This script performs the following steps:
 * 1. Wait for the user to upload an image.
 * 2. Scale the uploaded image to fit within the background dimensions.
 * 3. Compose the scaled image onto the New Year background image, centered
 *    horizontally and aligned to the background bottom.
 * 4. Slice the composite into nine equal parts along the background’s grid
 *    lines, and create canvas previews with download links for each piece.
 */

(() => {
  const fileInput = document.getElementById('fileInput');
  const statusEl = document.getElementById('status');
  const bgImgEl = document.getElementById('backgroundImage');
  const previewWrapper = document.getElementById('previewWrapper');
  const previewCanvas = document.getElementById('previewCanvas');
  const gridContainer = document.getElementById('gridContainer');

  const getOpaqueBoundingBox = (image, alphaThreshold = 8) => {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = image.width;
    tempCanvas.height = image.height;
    const tCtx = tempCanvas.getContext('2d');
    tCtx.drawImage(image, 0, 0);
    const { data } = tCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    let minX = tempCanvas.width;
    let minY = tempCanvas.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < tempCanvas.height; y++) {
      for (let x = 0; x < tempCanvas.width; x++) {
        const idx = (y * tempCanvas.width + x) * 4;
        if (data[idx + 3] > alphaThreshold) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX === -1 || maxY === -1) {
      return { x: 0, y: 0, width: image.width, height: image.height };
    }
    return {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    };
  };

  // Main handler for image uploads
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Reset previous output
    gridContainer.innerHTML = '';
    previewWrapper.style.display = 'none';
    statusEl.textContent = 'Loading image…';

    // Read uploaded image into an HTMLImageElement
    const imgURL = URL.createObjectURL(file);
    const inputImg = new Image();
    inputImg.crossOrigin = 'anonymous';
    inputImg.src = imgURL;
    await new Promise((resolve) => {
      inputImg.onload = resolve;
      inputImg.onerror = resolve;
    });

    // Ensure background is loaded
    if (!bgImgEl.complete) {
      await new Promise((resolve) => {
        bgImgEl.onload = resolve;
        bgImgEl.onerror = resolve;
      });
    }

    try {
      statusEl.textContent = 'Composing image…';
      const bbox = getOpaqueBoundingBox(inputImg);

      // Compose onto background
      const bgW = bgImgEl.naturalWidth;
      const bgH = bgImgEl.naturalHeight;
      previewCanvas.width = bgW;
      previewCanvas.height = bgH;
      const cCtx = previewCanvas.getContext('2d');
      // Draw background first
      cCtx.drawImage(bgImgEl, 0, 0, bgW, bgH);

      // Compute target size: fit within the full background while preserving aspect
      const cellW = bgW / 3;
      const cellH = bgH / 3;
      const maxPersonW = bgW;
      const maxPersonH = bgH;
      const scale = Math.min(maxPersonW / bbox.width, maxPersonH / bbox.height);
      // Center horizontally, align bottom to the background bottom
      let drawX = (bgW - bbox.width * scale) / 2 - bbox.x * scale;
      let drawY = bgH - bbox.height * scale - bbox.y * scale;
      // Draw scaled person onto composite
      cCtx.drawImage(inputImg, drawX, drawY, inputImg.width * scale, inputImg.height * scale);

      statusEl.textContent = 'Composed! Generating grid…';
      previewWrapper.style.display = 'block';

      // Slice into 9 pieces
      gridContainer.innerHTML = '';
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          const pieceCanvas = document.createElement('canvas');
          pieceCanvas.width = cellW;
          pieceCanvas.height = cellH;
          const pcCtx = pieceCanvas.getContext('2d');
          pcCtx.drawImage(
            previewCanvas,
            col * cellW,
            row * cellH,
            cellW,
            cellH,
            0,
            0,
            cellW,
            cellH
          );
          // Create a container for each piece
          const div = document.createElement('div');
          div.className = 'grid-item';
          div.appendChild(pieceCanvas);
          const link = document.createElement('a');
          link.className = 'download-link';
          link.textContent = 'Download';
          link.href = pieceCanvas.toDataURL('image/png');
          link.download = `piece_${row}_${col}.png`;
          div.appendChild(link);
          gridContainer.appendChild(div);
        }
      }
      statusEl.textContent = 'Done! You can download each grid piece.';
    } catch (err) {
      console.error(err);
      statusEl.textContent = 'Error: ' + err;
    }
  });
})();
