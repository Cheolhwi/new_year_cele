/*
 * Main JavaScript for the 9‑Grid Poster Composer.
 *
 * This script performs the following steps:
 * 1. Wait for the user to upload an image.
 * 2. Load and warm up the BodyPix model (for person segmentation) from the CDN.
 * 3. Segment the person in the uploaded image and create a transparent mask.
 * 4. Compute a bounding box around the person and scale the person to fit
 *    approximately two grid squares (2/3) of the background dimensions.
 * 5. Compose the scaled person onto the New Year background image, centred and
 *    slightly shifted upwards to match the provided example.
 * 6. Slice the composite into nine equal parts along the background’s grid
 *    lines, and create canvas previews with download links for each piece.
 */

(() => {
  const fileInput = document.getElementById('fileInput');
  const statusEl = document.getElementById('status');
  const bgImgEl = document.getElementById('backgroundImage');
  const previewWrapper = document.getElementById('previewWrapper');
  const previewCanvas = document.getElementById('previewCanvas');
  const gridContainer = document.getElementById('gridContainer');

  let modelPromise;

  // Lazy-load BodyPix model
  async function loadModel() {
    if (!modelPromise) {
      statusEl.textContent = 'Loading segmentation model…';
      // Load BodyPix with MobileNetV1 architecture for small size
      modelPromise = bodyPix.load({
        architecture: 'MobileNetV1',
        outputStride: 16,
        multiplier: 0.75,
        quantBytes: 2,
      });
    }
    return modelPromise;
  }

  // Compute bounding box from a binary alpha mask. Returns {x, y, width, height}
  function computeBoundingBox(maskImageData) {
    const { data, width, height } = maskImageData;
    let minX = width, minY = height, maxX = 0, maxY = 0;
    let found = false;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha > 0) {
          found = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (!found) {
      // Default to full image if nothing found
      return { x: 0, y: 0, width: width, height: height };
    }
    return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  }

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
      // Load model
      const model = await loadModel();
      statusEl.textContent = 'Segmenting person…';
      // Perform segmentation; returns an object with .data array of labels
      const segmentation = await model.segmentPerson(inputImg, {
        internalResolution: 'medium',
        segmentationThreshold: 0.7,
      });
      const { data: segData, width: segW, height: segH } = segmentation;
      // Build a mask image where alpha is 255 for person pixels
      const maskImageData = new ImageData(segW, segH);
      for (let i = 0; i < segData.length; i++) {
        const isPerson = segData[i] === 1;
        const offset = i * 4;
        // White pixel
        maskImageData.data[offset] = 255;
        maskImageData.data[offset + 1] = 255;
        maskImageData.data[offset + 2] = 255;
        maskImageData.data[offset + 3] = isPerson ? 255 : 0;
      }
      // Compute bounding box of the mask
      const bbox = computeBoundingBox(maskImageData);
      // Prepare offscreen canvas for the person
      const personCanvas = document.createElement('canvas');
      personCanvas.width = inputImg.width;
      personCanvas.height = inputImg.height;
      const pCtx = personCanvas.getContext('2d');
      // Draw original image
      pCtx.drawImage(inputImg, 0, 0);
      // Draw mask onto a temporary canvas
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = segW;
      maskCanvas.height = segH;
      const mCtx = maskCanvas.getContext('2d');
      mCtx.putImageData(maskImageData, 0, 0);
      // Use destination-in composite to keep only the person pixels
      pCtx.globalCompositeOperation = 'destination-in';
      pCtx.drawImage(maskCanvas, 0, 0, personCanvas.width, personCanvas.height);
      // Reset composite mode
      pCtx.globalCompositeOperation = 'source-over';

      // Compose onto background
      const bgW = bgImgEl.naturalWidth;
      const bgH = bgImgEl.naturalHeight;
      previewCanvas.width = bgW;
      previewCanvas.height = bgH;
      const cCtx = previewCanvas.getContext('2d');
      // Draw background first
      cCtx.drawImage(bgImgEl, 0, 0, bgW, bgH);

      // Compute target size for the person: limit to two grid squares
      const cellW = bgW / 3;
      const cellH = bgH / 3;
      const maxPersonW = cellW * 2;
      const maxPersonH = cellH * 2;
      const scale = Math.min(maxPersonW / bbox.width, maxPersonH / bbox.height);
      // Compute scaled bounding box centre
      const bboxCenterX = (bbox.x + bbox.width / 2) * scale;
      const bboxCenterY = (bbox.y + bbox.height / 2) * scale;
      // Target centre of person: centre of canvas
      let drawX = bgW / 2 - bboxCenterX;
      let drawY = bgH / 2 - bboxCenterY;
      // Shift slightly upward (10% of cell height) to replicate example
      drawY -= cellH * 0.1;
      // Draw scaled person onto composite
      cCtx.drawImage(
        personCanvas,
        drawX,
        drawY,
        personCanvas.width * scale,
        personCanvas.height * scale
      );

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