onmessage = (event) => {
  const msg = event.data;
  // console.log(msg);
  let imgElement;

  // Generate different lightning types based on requested type
  const boltType = msg.type || 'CG';

  switch(boltType) {
    case 'IC':
      imgElement = generateIntracloudBolt(msg.width, msg.height);
      break;
    case 'CC':
      imgElement = generateCloudToCloudBolt(msg.width, msg.height);
      break;
    case 'SPIDER':
      imgElement = generateSpiderLightning(msg.width, msg.height);
      break;
    case 'ANVIL':
      imgElement = generateAnvilCrawler(msg.width, msg.height);
      break;
    case 'POSITIVE':
      imgElement = generatePositiveCGBolt(msg.width, msg.height);
      break;
    case 'SPRITE':
      imgElement = generateSpritePattern(msg.width, msg.height);
      break;
    case 'CG':
    default:
      imgElement = generateLightningBolt(msg.width, msg.height);
      break;
  }

  postMessage(imgElement);
};


function generateLightningBolt(width, height)
{
  const lightningCanvas = new OffscreenCanvas(width, height);
  const ctx = lightningCanvas.getContext('2d');

  ctx.clearRect(0, 0, width, height);


  function genLightningColor(lineWidth)
  {
    const colR = 12;
    const colG = 12;
    const colB = 12;
    brightness = Math.pow(lineWidth, 2.0);
    return `rgb(${colR * brightness}, ${colG * brightness}, ${colB * brightness})`;
  }


  ctx.beginPath();

  let startX = width / 2.0;
  let startY = 0;
  let angle = Math.PI / 6.;
  let lineWidth = 9.0;
  const targetAngle = 0.0;

  ctx.moveTo(startX, startY);

  ctx.lineWidth = lineWidth;

  while (startY < height) {

    const nextX = startX + Math.sin(angle);
    const nextY = startY + Math.cos(angle);

    angle += (Math.random() - 0.5) * 1.4;  // 0.7

    angle -= (angle - targetAngle) * 0.08; // keep it going in a general direction

    ctx.lineTo(nextX, nextY);

    startX = nextX;
    startY = nextY;


    if (Math.random() < 0.015 * (1. - nextY / height)) { // branch
      ctx.strokeStyle = genLightningColor(lineWidth);
      ctx.stroke();
      drawBranch(nextX, nextY, targetAngle + (Math.random() - 0.5) * 2.5, lineWidth * 0.5 * Math.random());
      ctx.beginPath();
      ctx.moveTo(nextX, nextY); // move back to last position after drawing branch
      ctx.lineWidth = lineWidth;
    }
    
    // Ensure lightning reaches the bottom
    if (startY >= height - 1) {
      ctx.lineTo(startX, height);
      break;
    }
  }
  ctx.strokeStyle = genLightningColor(lineWidth);
  ctx.stroke();


  return ctx.getImageData(0, 0, width, height);


  function drawBranch(startX, startY, targetAngle, line_width)
  {
    let angle = targetAngle;

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineWidth = line_width;

    while (startY < height) {

      const nextX = startX + Math.sin(angle);
      const nextY = startY + Math.cos(angle);

      angle += (Math.random() - 0.5) * 0.7;

      angle -= (angle - targetAngle) * 0.08; // keep it going in a general direction

      ctx.lineTo(nextX, nextY);

      startX = nextX;
      startY = nextY;

      if (Math.random() < 0.018) { // reduce width

        ctx.strokeStyle = genLightningColor(line_width);
        ctx.stroke();
        line_width -= 0.2;

        if (line_width < 0.1)
          return;

        if (Math.random() < 0.1) { // branch 0.005

          drawBranch(nextX, nextY, targetAngle + (Math.random() - 0.5) * 1.5, line_width);
        }

        ctx.beginPath();
        ctx.moveTo(nextX, nextY); // move back to last position after drawing branch
        ctx.lineWidth = line_width;
      }
      
      // Ensure branch reaches the bottom
      if (startY >= height - 1) {
        ctx.lineTo(startX, height);
        break;
      }
    }
    ctx.strokeStyle = genLightningColor(line_width);
    ctx.stroke();
  }
}

// Compact jagged intracloud channel (short vertical reach, branches)
function generateIntracloudBolt(width, height)
{
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);

  function getColor(lineWidth) {
    const b = Math.pow(lineWidth, 2.0);
    return `rgb(${12 * b}, ${13 * b}, ${16 * b})`;
  }

  const startX = width * 0.5;
  const startY = height * 0.32;
  const endY = height * 0.68;
  let x = startX;
  let y = startY;
  let angle = (Math.random() - 0.5) * 0.6;
  let lineWidth = 7.0;

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineWidth = lineWidth;

  while (y < endY) {
    const nextX = x + Math.sin(angle) * 1.4;
    const nextY = y + Math.cos(angle) * 1.2;
    angle += (Math.random() - 0.5) * 1.2;
    angle *= 0.88;
    ctx.lineTo(nextX, nextY);
    x = nextX;
    y = nextY;

    if (Math.random() < 0.025) {
      ctx.strokeStyle = getColor(lineWidth);
      ctx.stroke();
      let bx = x;
      let by = y;
      const bAng = angle + (Math.random() - 0.5) * 1.6;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineWidth = lineWidth * 0.55;
      for (let i = 0; i < 18; i++) {
        bx += Math.sin(bAng + (Math.random() - 0.5) * 0.8) * 1.1;
        by += Math.cos(bAng + (Math.random() - 0.5) * 0.8) * 0.9;
        ctx.lineTo(bx, by);
      }
      ctx.strokeStyle = getColor(lineWidth * 0.55);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineWidth = lineWidth;
    }
  }

  ctx.strokeStyle = getColor(lineWidth);
  ctx.stroke();
  return ctx.getImageData(0, 0, width, height);
}

// Generate horizontal cloud-to-cloud lightning bolt
function generateCloudToCloudBolt(width, height)
{
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, width, height);

  function getColor(lineWidth) {
    const brightness = Math.pow(lineWidth, 2.0);
    return `rgb(${12 * brightness}, ${12 * brightness}, ${16 * brightness})`; // Slightly bluer
  }

  // CC lightning is mostly horizontal with some vertical spread
  const centerY = height * 0.5;
  let startX = width * 0.1;
  const endX = width * 0.9;

  ctx.beginPath();
  ctx.moveTo(startX, centerY);

  let currentX = startX;
  let currentY = centerY;
  let lineWidth = 8.0;
  ctx.lineWidth = lineWidth;

  // Main horizontal channel with zigzag
  while (currentX < endX) {
    const stepX = 2 + Math.random() * 3;
    const zigzagY = (Math.random() - 0.5) * 20; // Moderate vertical spread

    currentX += stepX;
    currentY += zigzagY * 0.3; // Dampened vertical movement

    // Keep near center line
    currentY = centerY + (currentY - centerY) * 0.7;

    ctx.lineTo(currentX, currentY);

    // Occasional vertical branches
    if (Math.random() < 0.02) {
      ctx.strokeStyle = getColor(lineWidth);
      ctx.stroke();
      drawCCBranch(ctx, currentX, currentY, lineWidth * 0.6, height, getColor);
      ctx.beginPath();
      ctx.moveTo(currentX, currentY);
      ctx.lineWidth = lineWidth;
    }
  }

  ctx.strokeStyle = getColor(lineWidth);
  ctx.stroke();

  return ctx.getImageData(0, 0, width, height);

  function drawCCBranch(ctx, startX, startY, lineWidth, height, getColor) {
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineWidth = lineWidth;

    let x = startX;
    let y = startY;
    const direction = Math.random() > 0.5 ? 1 : -1; // Up or down

    while (Math.abs(y - startY) < height * 0.15 && x > 0 && x < width) {
      y += direction * (1 + Math.random());
      x += (Math.random() - 0.5) * 2;
      ctx.lineTo(x, y);

      if (Math.random() < 0.03) {
        ctx.strokeStyle = getColor(lineWidth);
        ctx.stroke();
        lineWidth -= 0.5;
        if (lineWidth < 0.5) return;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineWidth = lineWidth;
      }
    }

    ctx.strokeStyle = getColor(lineWidth);
    ctx.stroke();
  }
}

// Generate spider lightning - flat horizontal crawling pattern
function generateSpiderLightning(width, height)
{
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, width, height);

  function getColor(lineWidth) {
    const brightness = Math.pow(lineWidth, 2.0);
    return `rgb(${14 * brightness}, ${12 * brightness}, ${13 * brightness})`; // Slight reddish tint
  }

  const numTendrils = 7;
  const centerX = width * 0.5;
  const centerY = height * 0.5;

  // Draw multiple tendrils spreading outward
  for (let t = 0; t < numTendrils; t++) {
    const angle = (t / (numTendrils - 1) - 0.5) * Math.PI * 0.8; // Spread across horizontal arc
    const length = width * (0.3 + Math.random() * 0.3);

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);

    let x = centerX;
    let y = centerY;
    let lineWidth = 6.0;
    ctx.lineWidth = lineWidth;

    const steps = 100;
    for (let i = 0; i < steps; i++) {
      const progress = i / steps;
      const distance = length * progress;

      // Calculate base position along tendril
      const baseX = centerX + Math.cos(angle) * distance;
      const baseY = centerY + Math.sin(angle) * distance * 0.1; // Very flat - minimal vertical

      // Add noise for crawling effect
      const noiseX = (Math.random() - 0.5) * 3;
      const noiseY = (Math.random() - 0.5) * 1; // Very narrow vertical spread

      x = baseX + noiseX;
      y = baseY + noiseY;

      ctx.lineTo(x, y);

      // Gradual fade
      if (i % 15 === 0) {
        ctx.strokeStyle = getColor(lineWidth);
        ctx.stroke();
        lineWidth *= 0.9;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineWidth = lineWidth;
      }
    }

    ctx.strokeStyle = getColor(lineWidth);
    ctx.stroke();
  }

  return ctx.getImageData(0, 0, width, height);
}

// Thicker positive cloud-to-ground bolt
function generatePositiveCGBolt(width, height)
{
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);

  function getColor(lineWidth) {
    const b = Math.pow(lineWidth, 1.8);
    return `rgb(${14 * b}, ${13 * b}, ${15 * b})`;
  }

  let startX = width / 2.0;
  let startY = 0;
  let angle = Math.PI / 5.;
  let lineWidth = 14.0;
  const targetAngle = 0.0;

  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineWidth = lineWidth;

  while (startY < height) {
    const nextX = startX + Math.sin(angle) * 1.2;
    const nextY = startY + Math.cos(angle) * 1.2;
    angle += (Math.random() - 0.5) * 1.6;
    angle -= (angle - targetAngle) * 0.06;
    ctx.lineTo(nextX, nextY);
    startX = nextX;
    startY = nextY;

    if (Math.random() < 0.02 * (1. - nextY / height)) {
      ctx.strokeStyle = getColor(lineWidth);
      ctx.stroke();
      drawBranch(nextX, nextY, targetAngle + (Math.random() - 0.5) * 2.0, lineWidth * 0.55);
      ctx.beginPath();
      ctx.moveTo(nextX, nextY);
      ctx.lineWidth = lineWidth;
    }
    if (startY >= height - 1) {
      ctx.lineTo(startX, height);
      break;
    }
  }
  ctx.strokeStyle = getColor(lineWidth);
  ctx.stroke();
  return ctx.getImageData(0, 0, width, height);

  function drawBranch(startX, startY, targetAngle, line_width) {
    let angle = targetAngle;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineWidth = line_width;
    while (startY < height) {
      const nextX = startX + Math.sin(angle);
      const nextY = startY + Math.cos(angle);
      angle += (Math.random() - 0.5) * 0.8;
      angle -= (angle - targetAngle) * 0.08;
      ctx.lineTo(nextX, nextY);
      startX = nextX;
      startY = nextY;
      if (Math.random() < 0.02) {
        ctx.strokeStyle = getColor(line_width);
        ctx.stroke();
        line_width -= 0.25;
        if (line_width < 0.15) return;
        ctx.beginPath();
        ctx.moveTo(nextX, nextY);
        ctx.lineWidth = line_width;
      }
      if (startY >= height - 1) break;
    }
    ctx.strokeStyle = getColor(line_width);
    ctx.stroke();
  }
}

// Large horizontal anvil crawler discharge
function generateAnvilCrawler(width, height)
{
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);

  function getColor(lineWidth) {
    const b = Math.pow(lineWidth, 2.0);
    return `rgb(${13 * b}, ${12 * b}, ${16 * b})`;
  }

  const centerY = height * 0.42;
  const numChannels = 3 + Math.floor(Math.random() * 3);

  for (let ch = 0; ch < numChannels; ch++) {
    const yOff = (ch - numChannels / 2) * height * 0.04;
    let startX = width * (0.05 + Math.random() * 0.1);
    let currentX = startX;
    let currentY = centerY + yOff;
    let lineWidth = 5.0 + Math.random() * 3.0;

    ctx.beginPath();
    ctx.moveTo(currentX, currentY);
    ctx.lineWidth = lineWidth;

    while (currentX < width * 0.92) {
      const stepX = 3 + Math.random() * 5;
      currentX += stepX;
      currentY += (Math.random() - 0.5) * 8;
      currentY = centerY + yOff + (currentY - centerY - yOff) * 0.6;
      ctx.lineTo(currentX, currentY);

      if (Math.random() < 0.04) {
        ctx.strokeStyle = getColor(lineWidth);
        ctx.stroke();
        let bx = currentX;
        let by = currentY;
        const dir = Math.random() > 0.5 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        for (let j = 0; j < 20; j++) {
          by += dir * (1 + Math.random());
          bx += (Math.random() - 0.5) * 3;
          ctx.lineTo(bx, by);
        }
        ctx.strokeStyle = getColor(lineWidth * 0.5);
        ctx.lineWidth = lineWidth * 0.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(currentX, currentY);
        ctx.lineWidth = lineWidth;
      }
    }
    ctx.strokeStyle = getColor(lineWidth);
    ctx.stroke();
  }

  return ctx.getImageData(0, 0, width, height);
}

// Generate sprite pattern - reddish glow above storm
function generateSpritePattern(width, height)
{
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, width, height);

  const centerX = width * 0.5;
  const centerY = height * 0.6; // Slightly below center

  // Create radial gradient for sprite glow
  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY * 0.5, width * 0.4);

  // Sprite colors: reddish-orange with tendrils
  gradient.addColorStop(0, 'rgba(255, 60, 20, 0.9)');     // Bright center
  gradient.addColorStop(0.2, 'rgba(255, 80, 30, 0.6)');   // Inner glow
  gradient.addColorStop(0.5, 'rgba(255, 100, 40, 0.3)');  // Middle
  gradient.addColorStop(1, 'rgba(255, 120, 50, 0)');     // Fade out

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Add vertical tendrils reaching upward
  ctx.strokeStyle = 'rgba(255, 70, 25, 0.7)';
  ctx.lineWidth = 2;

  const numTendrils = 12;
  for (let i = 0; i < numTendrils; i++) {
    const x = centerX + (i - numTendrils/2) * (width * 0.03);
    const tendrilHeight = height * (0.2 + Math.random() * 0.3);

    ctx.beginPath();
    ctx.moveTo(x, centerY);

    let currentX = x;
    let currentY = centerY;

    for (let j = 0; j < 50; j++) {
      currentY -= tendrilHeight / 50;
      currentX += (Math.random() - 0.5) * 2;
      ctx.lineTo(currentX, currentY);
    }

    ctx.stroke();
  }

  // Add halo ring
  ctx.strokeStyle = 'rgba(255, 90, 35, 0.5)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(centerX, centerY, width * 0.12, height * 0.06, 0, 0, Math.PI * 2);
  ctx.stroke();

  return ctx.getImageData(0, 0, width, height);
}