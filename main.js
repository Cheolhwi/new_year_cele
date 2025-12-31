/*
 * Main JavaScript for the 9-grid Poster Composer.
 *
 * This script performs the following steps:
 * 1. Wait for the user to upload an image.
 * 2. Fit the uploaded image inside the background.
 * 3. Let the user drag and scale the image in the preview.
 * 4. Generate the 3x3 grid after confirmation.
 */

(() => {
  const fileInput = document.getElementById('fileInput');
  const statusEl = document.getElementById('status');
  const bgImgEl = document.getElementById('backgroundImage');
  const previewWrapper = document.getElementById('previewWrapper');
  const previewCanvas = document.getElementById('previewCanvas');
  const gridContainer = document.getElementById('gridContainer');
  const scaleRange = document.getElementById('scaleRange');
  const scaleValue = document.getElementById('scaleValue');
  const zoomOutBtn = document.getElementById('zoomOut');
  const zoomInBtn = document.getElementById('zoomIn');
  const resetBtn = document.getElementById('resetPosition');
  const confirmBtn = document.getElementById('confirmGrid');

  const state = {
    inputImg: null,
    bbox: null,
    baseScale: 1,
    scaleRatio: 1,
    imagePos: { x: 0, y: 0 },
    initialPos: { x: 0, y: 0 },
  };

  const dragState = {
    isDragging: false,
    pointerId: null,
    start: { x: 0, y: 0 },
    origin: { x: 0, y: 0 },
  };

  let gridDirty = true;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const setStatus = (text) => {
    statusEl.textContent = text;
  };

  const getBackgroundSize = () => ({
    width: bgImgEl.naturalWidth,
    height: bgImgEl.naturalHeight,
  });

  const getScale = () => state.baseScale * state.scaleRatio;

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

  const updateScaleUI = () => {
    scaleRange.value = state.scaleRatio.toFixed(2);
    scaleValue.textContent = `${Math.round(state.scaleRatio * 100)}%`;
  };

  const clearGrid = () => {
    gridContainer.innerHTML = '';
  };

  const setEditMode = () => {
    clearGrid();
    gridDirty = true;
    setStatus('Adjust position and scale, then click Generate 9-grid.');
  };

  const markNeedsGrid = () => {
    if (!gridDirty) {
      setEditMode();
    }
  };

  const getBoundingCenter = (scale) => ({
    x: state.imagePos.x + (state.bbox.x + state.bbox.width / 2) * scale,
    y: state.imagePos.y + (state.bbox.y + state.bbox.height / 2) * scale,
  });

  const renderComposite = () => {
    if (!state.inputImg || !state.bbox) return;
    const { width: bgW, height: bgH } = getBackgroundSize();
    previewCanvas.width = bgW;
    previewCanvas.height = bgH;
    const ctx = previewCanvas.getContext('2d');
    ctx.clearRect(0, 0, bgW, bgH);
    ctx.drawImage(bgImgEl, 0, 0, bgW, bgH);

    const scale = getScale();
    ctx.drawImage(
      state.inputImg,
      state.imagePos.x,
      state.imagePos.y,
      state.inputImg.width * scale,
      state.inputImg.height * scale
    );
  };

  const updateScale = (nextRatio) => {
    if (!state.inputImg || !state.bbox) return;
    const min = parseFloat(scaleRange.min);
    const max = parseFloat(scaleRange.max);
    const clampedRatio = clamp(nextRatio, min, max);
    const oldScale = getScale();
    const center = getBoundingCenter(oldScale);

    state.scaleRatio = clampedRatio;

    const newScale = getScale();
    state.imagePos.x = center.x - (state.bbox.x + state.bbox.width / 2) * newScale;
    state.imagePos.y = center.y - (state.bbox.y + state.bbox.height / 2) * newScale;

    updateScaleUI();
    renderComposite();
    markNeedsGrid();
  };

  const resetPosition = () => {
    if (!state.inputImg) return;
    state.scaleRatio = 1;
    state.imagePos = { ...state.initialPos };
    updateScaleUI();
    renderComposite();
    setEditMode();
  };

  const getCanvasPoint = (event) => {
    const rect = previewCanvas.getBoundingClientRect();
    const scaleX = previewCanvas.width / rect.width;
    const scaleY = previewCanvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const isPointerOnImage = (point) => {
    const scale = getScale();
    const width = state.inputImg.width * scale;
    const height = state.inputImg.height * scale;
    return (
      point.x >= state.imagePos.x &&
      point.x <= state.imagePos.x + width &&
      point.y >= state.imagePos.y &&
      point.y <= state.imagePos.y + height
    );
  };

  const startDrag = (event) => {
    if (!state.inputImg || event.button !== 0) return;
    const point = getCanvasPoint(event);
    if (!isPointerOnImage(point)) return;

    dragState.isDragging = true;
    dragState.pointerId = event.pointerId;
    dragState.start = point;
    dragState.origin = { ...state.imagePos };
    previewCanvas.setPointerCapture(event.pointerId);
    previewCanvas.classList.add('is-dragging');
  };

  const moveDrag = (event) => {
    if (!dragState.isDragging || dragState.pointerId !== event.pointerId) return;
    const point = getCanvasPoint(event);
    const dx = point.x - dragState.start.x;
    const dy = point.y - dragState.start.y;
    state.imagePos.x = dragState.origin.x + dx;
    state.imagePos.y = dragState.origin.y + dy;
    renderComposite();
    markNeedsGrid();
  };

  const endDrag = (event) => {
    if (!dragState.isDragging || dragState.pointerId !== event.pointerId) return;
    dragState.isDragging = false;
    dragState.pointerId = null;
    previewCanvas.releasePointerCapture(event.pointerId);
    previewCanvas.classList.remove('is-dragging');
  };

  previewCanvas.addEventListener('pointerdown', startDrag);
  previewCanvas.addEventListener('pointermove', moveDrag);
  previewCanvas.addEventListener('pointerup', endDrag);
  previewCanvas.addEventListener('pointercancel', endDrag);

  scaleRange.addEventListener('input', () => {
    updateScale(parseFloat(scaleRange.value));
  });

  zoomOutBtn.addEventListener('click', () => {
    updateScale(state.scaleRatio - 0.05);
  });

  zoomInBtn.addEventListener('click', () => {
    updateScale(state.scaleRatio + 0.05);
  });

  resetBtn.addEventListener('click', resetPosition);

  const generateGrid = () => {
    const { width: bgW, height: bgH } = getBackgroundSize();
    const cellW = bgW / 3;
    const cellH = bgH / 3;
    clearGrid();
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
  };

  confirmBtn.addEventListener('click', () => {
    if (!state.inputImg) {
      setStatus('Please upload an image first.');
      return;
    }
    setStatus('Generating grid...');
    renderComposite();
    generateGrid();
    gridDirty = false;
    setStatus('Done! You can download each grid piece.');
  });

  fileInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    clearGrid();
    previewWrapper.style.display = 'none';
    previewCanvas.classList.remove('is-dragging');
    dragState.isDragging = false;
    setStatus('Loading image...');
    state.inputImg = null;
    state.bbox = null;
    state.baseScale = 1;
    state.scaleRatio = 1;
    state.imagePos = { x: 0, y: 0 };
    state.initialPos = { x: 0, y: 0 };
    gridDirty = true;

    const imgURL = URL.createObjectURL(file);
    const inputImg = new Image();
    inputImg.crossOrigin = 'anonymous';
    inputImg.src = imgURL;
    await new Promise((resolve) => {
      inputImg.onload = resolve;
      inputImg.onerror = resolve;
    });
    URL.revokeObjectURL(imgURL);

    if (!inputImg.naturalWidth || !inputImg.naturalHeight) {
      setStatus('Error: Unable to load the image.');
      return;
    }

    if (!bgImgEl.complete) {
      await new Promise((resolve) => {
        bgImgEl.onload = resolve;
        bgImgEl.onerror = resolve;
      });
    }

    try {
      const bbox = getOpaqueBoundingBox(inputImg);
      const { width: bgW, height: bgH } = getBackgroundSize();
      const cellW = bgW / 3;
      const cellH = bgH / 3;
      const maxPersonW = cellW * 2;
      const maxPersonH = cellH * 2;
      const baseScale = Math.min(maxPersonW / bbox.width, maxPersonH / bbox.height);
      const drawX = (bgW - bbox.width * baseScale) / 2 - bbox.x * baseScale;
      const drawY = bgH - bbox.height * baseScale - bbox.y * baseScale;

      state.inputImg = inputImg;
      state.bbox = bbox;
      state.baseScale = baseScale;
      state.scaleRatio = 1;
      state.imagePos = { x: drawX, y: drawY };
      state.initialPos = { x: drawX, y: drawY };

      updateScaleUI();
      previewWrapper.style.display = 'block';
      renderComposite();
      setEditMode();
    } catch (err) {
      console.error(err);
      setStatus('Error: ' + err);
    }
  });
})();
