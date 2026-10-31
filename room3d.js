/**
 * EcoSense — Working 3D Smart Room Simulation Engine
 * Three.js WebGL Room with Animated Physics, Raycasting, and HUD Controls
 */

// --- 3D Scene Global Variables ---
let scene, camera, renderer, controls;
let raycaster, mouse;
let fanGroup, fanBlades, acGroup, acLouver, acBreezeParticles, tvMesh, tvScreenCanvas, tvScreenTexture, tvLedMesh, tvRedLight;
let ceilingLightFixture, roomPointLight, ambientLight;
let windowGlassPane, deskLaptop;
let interactiveObjects = [];
let hoveredObject = null;

// Fan Physics
let fanSpeed = 0.22;
let targetFanSpeed = 0.22;

// TV Screen Texture Animation
let tvCanvasCtx, tvAnimAngle = 0;

// Camera Target Animation
let isCameraAnimating = false;
let targetCamPos = null, targetControlsTarget = null;

// Appliance State Model for 3D Room
const room3dState = {
  fan: { name: "Ceiling Fan", status: "on", watts: 75 },
  ac: { name: "Inverter AC", status: "on", temp: 24, watts: 890 },
  tv: { name: "Smart TV 55\"", status: "on", watts: 120, standbyWatts: 15 },
  light: { name: "Room Chandelier", status: "on", watts: 40 },
  window: { name: "Sliding Window", isOpen: false }
};

// --- Initialization ---
function init3D() {
  const container = document.getElementById("threeCanvasContainer");
  if (!container) return;

  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || (window.innerHeight - 60);

  // 1. Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070d14);
  scene.fog = new THREE.FogExp2(0x070d14, 0.025);

  // 2. Camera
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  camera.position.set(9.5, 9.0, 11.5);

  // 3. Renderer with Soft Shadows
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  // 4. OrbitControls
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 - 0.05; // Don't go under floor
  controls.minDistance = 4;
  controls.maxDistance = 25;
  controls.target.set(0, 2.2, 0);

  // 5. Lighting Setup
  setupRoomLighting();

  // 6. Build 3D Architectural Room & Furniture
  buildRoomArchitecture();
  buildCeilingFan();
  buildAirConditioner();
  buildSmartTV();
  buildFurniture();
  buildRoomWindow();

  // 7. Raycasting Setup
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  // Event Listeners
  window.addEventListener("resize", onWindowResize);
  renderer.domElement.addEventListener("mousemove", onMouseMove);
  renderer.domElement.addEventListener("click", onSceneClick);

  // Initial HUD update
  update3dHUD();

  // Start Animation Loop
  animate3D();
}

// --- Lighting Architecture ---
function setupRoomLighting() {
  // Soft ambient baseline
  ambientLight = new THREE.AmbientLight(0x0d1f33, 0.55);
  scene.add(ambientLight);

  // Directional daylight pouring from window
  const sunLight = new THREE.DirectionalLight(0x93c5fd, 0.7);
  sunLight.position.set(-10, 8, 2);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 1024;
  sunLight.shadow.mapSize.height = 1024;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 25;
  sunLight.shadow.bias = -0.001;
  scene.add(sunLight);

  // Main Ceiling Light Fixture (Dynamic PointLight)
  roomPointLight = new THREE.PointLight(0xfef08a, 1.25, 14, 1.2);
  roomPointLight.position.set(0, 4.8, 0);
  roomPointLight.castShadow = true;
  roomPointLight.shadow.mapSize.width = 1024;
  roomPointLight.shadow.mapSize.height = 1024;
  roomPointLight.shadow.bias = -0.002;
  scene.add(roomPointLight);
}

// --- Architectural Room Structure ---
function buildRoomArchitecture() {
  // Parquet Wood Floor
  const floorGeo = new THREE.PlaneGeometry(10, 10);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x241a15,
    roughness: 0.65,
    metalness: 0.1
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Floor Decorative Rug
  const rugGeo = new THREE.PlaneGeometry(4.8, 3.8);
  const rugMat = new THREE.MeshStandardMaterial({
    color: 0x163447,
    roughness: 0.9
  });
  const rug = new THREE.Mesh(rugGeo, rugMat);
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.01, 0.5);
  rug.receiveShadow = true;
  scene.add(rug);

  // Wall Material
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x172230,
    roughness: 0.8
  });

  // Back Wall
  const backWallGeo = new THREE.BoxGeometry(10, 5.5, 0.2);
  const backWall = new THREE.Mesh(backWallGeo, wallMat);
  backWall.position.set(0, 2.75, -5.1);
  backWall.receiveShadow = true;
  scene.add(backWall);

  // Left Wall (Cutout around window)
  const leftWallGeo = new THREE.BoxGeometry(0.2, 5.5, 10);
  const leftWall = new THREE.Mesh(leftWallGeo, wallMat);
  leftWall.position.set(-5.1, 2.75, 0);
  leftWall.receiveShadow = true;
  scene.add(leftWall);

  // Baseboard moldings
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 });
  const trimBack = new THREE.Mesh(new THREE.BoxGeometry(10, 0.2, 0.08), trimMat);
  trimBack.position.set(0, 0.1, -4.96);
  scene.add(trimBack);

  const trimLeft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 10), trimMat);
  trimLeft.position.set(-4.96, 0.1, 0);
  scene.add(trimLeft);

  // Ceiling Light Dome Fixture
  const fixtureGroup = new THREE.Group();
  fixtureGroup.position.set(0, 5.2, 0);
  
  const domeGeo = new THREE.SphereGeometry(0.35, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const domeMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.4 });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.rotation.x = Math.PI;
  fixtureGroup.add(dome);

  // Glowing bulb mesh
  const bulbGeo = new THREE.SphereGeometry(0.18, 16, 16);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
  ceilingLightFixture = new THREE.Mesh(bulbGeo, bulbMat);
  ceilingLightFixture.position.y = -0.15;
  ceilingLightFixture.userData = { id: "light", name: "Ceiling Chandelier" };
  fixtureGroup.add(ceilingLightFixture);
  interactiveObjects.push(ceilingLightFixture);

  scene.add(fixtureGroup);
}

// --- 1. Working 3D Ceiling Fan ---
function buildCeilingFan() {
  fanGroup = new THREE.Group();
  fanGroup.position.set(0, 4.4, 0);

  // Downrod
  const rodGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.7, 12);
  const rodMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.5 });
  const rod = new THREE.Mesh(rodGeo, rodMat);
  rod.position.y = 0.35;
  fanGroup.add(rod);

  // Motor Cap
  const motorGeo = new THREE.CylinderGeometry(0.28, 0.24, 0.18, 24);
  const motorMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.4 });
  const motor = new THREE.Mesh(motorGeo, motorMat);
  fanGroup.add(motor);

  // Rotating Blades Group
  fanBlades = new THREE.Group();
  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.2,
    roughness: 0.4
  });

  // 4 Aerodynamic Curved Blades
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    const bladeGeo = new THREE.BoxGeometry(0.22, 0.015, 1.4);
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.set(Math.sin(angle) * 0.85, 0, Math.cos(angle) * 0.85);
    blade.rotation.y = angle;
    blade.rotation.x = 0.08; // Blade pitch angle
    fanBlades.add(blade);
  }

  fanBlades.userData = { id: "fan", name: "Ceiling Fan" };
  fanGroup.add(fanBlades);
  interactiveObjects.push(fanBlades);

  scene.add(fanGroup);
}

// --- 2. Working 3D Inverter Air Conditioner ---
function buildAirConditioner() {
  acGroup = new THREE.Group();
  acGroup.position.set(0, 4.1, -4.85);

  // White Chassis
  const acChassisGeo = new THREE.BoxGeometry(2.1, 0.65, 0.45);
  const acChassisMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.35 });
  const acChassis = new THREE.Mesh(acChassisGeo, acChassisMat);
  acChassis.castShadow = true;
  acGroup.add(acChassis);

  // Motorized Vent Louver Flap
  const louverGeo = new THREE.BoxGeometry(1.95, 0.04, 0.16);
  const louverMat = new THREE.MeshStandardMaterial({ color: 0x0284c7 });
  acLouver = new THREE.Mesh(louverGeo, louverMat);
  acLouver.position.set(0, -0.28, 0.15);
  acGroup.add(acLouver);

  // Digital Temperature LED Canvas Texture
  const acCanvas = document.createElement("canvas");
  acCanvas.width = 128;
  acCanvas.height = 64;
  const acCtx = acCanvas.getContext("2d");
  acCtx.fillStyle = "#020617";
  acCtx.fillRect(0, 0, 128, 64);
  acCtx.fillStyle = "#38bdf8";
  acCtx.font = "bold 32px monospace";
  acCtx.fillText("24°C", 24, 44);

  const acTexture = new THREE.CanvasTexture(acCanvas);
  const displayPlaneGeo = new THREE.PlaneGeometry(0.42, 0.22);
  const displayPlaneMat = new THREE.MeshBasicMaterial({ map: acTexture });
  const displayMesh = new THREE.Mesh(displayPlaneGeo, displayPlaneMat);
  displayMesh.position.set(0.65, 0.05, 0.235);
  acGroup.add(displayMesh);

  // 3D Particle Breeze System (Flowing cool air)
  const particleCount = 70;
  const breezeGeo = new THREE.BufferGeometry();
  const breezePos = new Float32Array(particleCount * 3);

  for (let i = 0; i < particleCount * 3; i += 3) {
    breezePos[i] = (Math.random() - 0.5) * 1.8;       // x spread across vent
    breezePos[i + 1] = -Math.random() * 2.2;          // y downward breeze
    breezePos[i + 2] = Math.random() * 1.8 + 0.3;     // z forward into room
  }
  breezeGeo.setAttribute("position", new THREE.BufferAttribute(breezePos, 3));

  const breezeMat = new THREE.PointsMaterial({
    color: 0x38bdf8,
    size: 0.06,
    transparent: true,
    opacity: 0.65,
    blending: THREE.AdditiveBlending
  });

  acBreezeParticles = new THREE.Points(breezeGeo, breezeMat);
  acGroup.add(acBreezeParticles);

  acGroup.userData = { id: "ac", name: "Inverter AC" };
  acChassis.userData = { id: "ac", name: "Inverter AC" };
  interactiveObjects.push(acChassis);

  scene.add(acGroup);
}

// --- 3. Working 3D Smart TV & Vampire Standby ---
function buildSmartTV() {
  const tvGroup = new THREE.Group();
  tvGroup.position.set(0, 1.85, -4.6);

  // Media Console Table
  const consoleGeo = new THREE.BoxGeometry(3.2, 0.75, 0.85);
  const consoleMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 });
  const consoleTable = new THREE.Mesh(consoleGeo, consoleMat);
  consoleTable.position.set(0, -1.05, 0.1);
  consoleTable.castShadow = true;
  consoleTable.receiveShadow = true;
  tvGroup.add(consoleTable);

  // TV Outer Bezel
  const bezelGeo = new THREE.BoxGeometry(2.6, 1.5, 0.08);
  const bezelMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2 });
  const tvBezel = new THREE.Mesh(bezelGeo, bezelMat);
  tvBezel.castShadow = true;
  tvGroup.add(tvBezel);

  // Dynamic Canvas Texture for Animated TV Broadcast
  tvScreenCanvas = document.createElement("canvas");
  tvScreenCanvas.width = 512;
  tvScreenCanvas.height = 288;
  tvCanvasCtx = tvScreenCanvas.getContext("2d");
  updateTvCanvas();

  tvScreenTexture = new THREE.CanvasTexture(tvScreenCanvas);
  const screenGeo = new THREE.PlaneGeometry(2.46, 1.38);
  const screenMat = new THREE.MeshBasicMaterial({ map: tvScreenTexture });
  tvMesh = new THREE.Mesh(screenGeo, screenMat);
  tvMesh.position.z = 0.045;
  tvGroup.add(tvMesh);

  // Vampire Standby Red LED Indicator
  const ledGeo = new THREE.SphereGeometry(0.02, 12, 12);
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
  tvLedMesh = new THREE.Mesh(ledGeo, ledMat);
  tvLedMesh.position.set(1.15, -0.68, 0.05);
  tvGroup.add(tvLedMesh);

  // Red Point Light for Vampire Mode Glow
  tvRedLight = new THREE.PointLight(0xef4444, 0, 1.5);
  tvRedLight.position.set(1.15, -0.68, 0.15);
  tvGroup.add(tvRedLight);

  tvMesh.userData = { id: "tv", name: "Smart TV 55\"" };
  interactiveObjects.push(tvMesh);

  scene.add(tvGroup);
}

function updateTvCanvas() {
  if (!tvCanvasCtx) return;
  const w = tvScreenCanvas.width;
  const h = tvScreenCanvas.height;

  if (room3dState.tv.status === "on") {
    // Dynamic animated eco broadcast wave
    tvCanvasCtx.fillStyle = "#022c22";
    tvCanvasCtx.fillRect(0, 0, w, h);

    tvCanvasCtx.fillStyle = "#10b981";
    tvCanvasCtx.font = "bold 26px sans-serif";
    tvCanvasCtx.fillText("● ECO-VISION 4K", 28, 48);

    tvCanvasCtx.strokeStyle = "#34d399";
    tvCanvasCtx.lineWidth = 4;
    tvCanvasCtx.beginPath();
    for (let x = 0; x < w; x += 6) {
      const y = h / 2 + Math.sin((x + tvAnimAngle) * 0.04) * 45;
      if (x === 0) tvCanvasCtx.moveTo(x, y);
      else tvCanvasCtx.lineTo(x, y);
    }
    tvCanvasCtx.stroke();
  } else {
    // Pitch black screen
    tvCanvasCtx.fillStyle = "#020617";
    tvCanvasCtx.fillRect(0, 0, w, h);
  }
}

// --- 4. Furniture & Decor ---
function buildFurniture() {
  // Comfortable Double Bed
  const bedGroup = new THREE.Group();
  bedGroup.position.set(2.6, 0, -1.8);

  // Wood Bed Frame
  const frameGeo = new THREE.BoxGeometry(2.8, 0.45, 3.8);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
  const bedFrame = new THREE.Mesh(frameGeo, frameMat);
  bedFrame.position.y = 0.25;
  bedFrame.castShadow = true;
  bedFrame.receiveShadow = true;
  bedGroup.add(bedFrame);

  // Headboard
  const headGeo = new THREE.BoxGeometry(2.8, 1.4, 0.2);
  const headboard = new THREE.Mesh(headGeo, frameMat);
  headboard.position.set(0, 0.9, -1.8);
  headboard.castShadow = true;
  bedGroup.add(headboard);

  // White Mattress
  const matGeo = new THREE.BoxGeometry(2.6, 0.35, 3.5);
  const matMaterial = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.9 });
  const mattress = new THREE.Mesh(matGeo, matMaterial);
  mattress.position.y = 0.55;
  bedGroup.add(mattress);

  // Cyan Eco Duvet Blanket
  const duvetGeo = new THREE.BoxGeometry(2.55, 0.08, 2.4);
  const duvetMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.8 });
  const duvet = new THREE.Mesh(duvetGeo, duvetMat);
  duvet.position.set(0, 0.73, 0.5);
  bedGroup.add(duvet);

  // Two Pillows
  const pillowGeo = new THREE.BoxGeometry(0.9, 0.16, 0.6);
  const pillowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  const pillow1 = new THREE.Mesh(pillowGeo, pillowMat);
  pillow1.position.set(-0.65, 0.78, -1.2);
  bedGroup.add(pillow1);

  const pillow2 = new THREE.Mesh(pillowGeo, pillowMat);
  pillow2.position.set(0.65, 0.78, -1.2);
  bedGroup.add(pillow2);

  scene.add(bedGroup);

  // Study Desk & Laptop on Left Side
  const deskGroup = new THREE.Group();
  deskGroup.position.set(-3.6, 0, 1.8);

  const deskTop = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.08, 2.6),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 })
  );
  deskTop.position.y = 1.35;
  deskTop.castShadow = true;
  deskGroup.add(deskTop);

  // Desk Legs
  const legMat = new THREE.MeshStandardMaterial({ color: 0x0f172a });
  const leg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.35), legMat);
  leg1.position.set(-0.7, 0.68, -1.15);
  deskGroup.add(leg1);
  const leg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.35), legMat);
  leg2.position.set(0.7, 0.68, -1.15);
  deskGroup.add(leg2);
  const leg3 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.35), legMat);
  leg3.position.set(-0.7, 0.68, 1.15);
  deskGroup.add(leg3);
  const leg4 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.35), legMat);
  leg4.position.set(0.7, 0.68, 1.15);
  deskGroup.add(leg4);

  // Laptop on Desk
  const laptopBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.02, 0.45),
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.6 })
  );
  laptopBase.position.set(0, 1.4, 0);
  deskGroup.add(laptopBase);

  const laptopScreen = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.42, 0.02),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
  );
  laptopScreen.position.set(0, 1.6, -0.2);
  laptopScreen.rotation.x = -0.25;
  deskGroup.add(laptopScreen);

  scene.add(deskGroup);

  // Potted Eco Plant in Corner
  const plantGroup = new THREE.Group();
  plantGroup.position.set(-4.2, 0, -4.2);

  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.25, 0.65, 16),
    new THREE.MeshStandardMaterial({ color: 0xc2410c, roughness: 0.8 })
  );
  pot.position.y = 0.32;
  pot.castShadow = true;
  plantGroup.add(pot);

  // Plant foliage spheres
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.6 });
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), leafMat);
    leaf.position.set((Math.random() - 0.5) * 0.4, 0.7 + i * 0.18, (Math.random() - 0.5) * 0.4);
    plantGroup.add(leaf);
  }
  scene.add(plantGroup);
}

// --- 5. Interactive 3D Window ---
function buildRoomWindow() {
  const windowGroup = new THREE.Group();
  windowGroup.position.set(-4.95, 2.6, -1.8);

  // Outer Window Frame
  const frameGeo = new THREE.BoxGeometry(0.12, 2.4, 2.4);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4 });
  const frame = new THREE.Mesh(frameGeo, frameMat);
  windowGroup.add(frame);

  // Sliding Glass Pane
  const glassGeo = new THREE.BoxGeometry(0.06, 2.2, 1.15);
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xbae6fd,
    transmission: 0.85,
    opacity: 0.65,
    transparent: true,
    roughness: 0.1,
    ior: 1.5
  });
  windowGlassPane = new THREE.Mesh(glassGeo, glassMat);
  windowGlassPane.position.set(0.02, 0, 0.55);
  windowGlassPane.userData = { id: "window", name: "Sliding Window" };
  windowGroup.add(windowGlassPane);
  interactiveObjects.push(windowGlassPane);

  scene.add(windowGroup);
}

// --- Raycasting Hover & Click Handlers ---
function onMouseMove(event) {
  const container = document.getElementById("threeCanvasContainer");
  const rect = container.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(interactiveObjects, true);

  const tooltip = document.getElementById("tooltip3d");

  if (intersects.length > 0) {
    let topObj = intersects[0].object;
    while (topObj && !topObj.userData.id && topObj.parent) {
      topObj = topObj.parent;
    }

    if (topObj && topObj.userData.id) {
      hoveredObject = topObj;
      container.style.cursor = "pointer";

      // Show Tooltip
      const id = topObj.userData.id;
      let text = "";
      if (id === "fan") text = `🌀 Ceiling Fan (${room3dState.fan.watts}W) — Click to ${room3dState.fan.status === 'on' ? 'Stop' : 'Spin'}`;
      else if (id === "ac") text = `❄️ Inverter AC (${room3dState.ac.watts}W, ${room3dState.ac.temp}°C) — Click to toggle`;
      else if (id === "tv") text = `📺 Smart TV (${room3dState.tv.watts}W) — Click to cycle Standby/Off`;
      else if (id === "light") text = `💡 Chandelier (${room3dState.light.watts}W) — Click to toggle light`;
      else if (id === "window") text = `🪟 Window (${room3dState.window.isOpen ? 'Open ⚠️' : 'Sealed ✓'}) — Click to toggle`;

      tooltip.textContent = text;
      tooltip.style.left = event.clientX + "px";
      tooltip.style.top = event.clientY + "px";
      tooltip.style.display = "block";
      return;
    }
  }

  hoveredObject = null;
  container.style.cursor = "default";
  if (tooltip) tooltip.style.display = "none";
}

function onSceneClick() {
  if (hoveredObject && hoveredObject.userData.id) {
    const id = hoveredObject.userData.id;
    if (id === "fan") toggleFan3D();
    else if (id === "ac") toggleAc3D();
    else if (id === "tv") cycleTv3D();
    else if (id === "light") toggleLight3D();
    else if (id === "window") toggleWindow3D();
  }
}

// --- Interactive 3D Control Actions ---
window.toggleFan3D = function() {
  const f = room3dState.fan;
  f.status = f.status === "on" ? "off" : "on";
  f.watts = f.status === "on" ? 75 : 0;
  targetFanSpeed = f.status === "on" ? 0.22 : 0;
  update3dHUD();
  syncBackend3D("/api/appliance/toggle", { room: "livingRoom", appliance: "fan" });
};

window.toggleAc3D = function() {
  const ac = room3dState.ac;
  ac.status = ac.status === "on" ? "off" : "on";
  ac.watts = ac.status === "on" ? (ac.temp <= 20 ? 1250 : 890) : 0;
  update3dHUD();
  syncBackend3D("/api/appliance/toggle", { room: "bedroom", appliance: "ac" });
};

window.setAcTemp3D = function(newTemp) {
  room3dState.ac.temp = parseInt(newTemp, 10);
  if (room3dState.ac.status === "on") {
    room3dState.ac.watts = room3dState.ac.temp <= 20 ? 1250 : (room3dState.ac.temp < 24 ? 1050 : 890);
  }
  update3dHUD();
  syncBackend3D("/api/appliance/ac-temp", { temp: room3dState.ac.temp });
};

window.cycleTv3D = function() {
  const tv = room3dState.tv;
  if (tv.status === "on") {
    tv.status = "standby";
    tv.watts = tv.standbyWatts;
  } else if (tv.status === "standby") {
    tv.status = "off";
    tv.watts = 0;
  } else {
    tv.status = "on";
    tv.watts = 120;
  }
  update3dHUD();
  syncBackend3D("/api/appliance/standby", { room: "livingRoom", appliance: "tv" });
};

window.toggleLight3D = function() {
  const l = room3dState.light;
  l.status = l.status === "on" ? "off" : "on";
  l.watts = l.status === "on" ? 40 : 0;
  update3dHUD();
  syncBackend3D("/api/appliance/toggle", { room: "livingRoom", appliance: "lights" });
};

window.toggleWindow3D = function() {
  room3dState.window.isOpen = !room3dState.window.isOpen;
  // Animate window pane sliding
  if (windowGlassPane) {
    windowGlassPane.position.z = room3dState.window.isOpen ? -0.55 : 0.55;
  }
  update3dHUD();
  syncBackend3D("/api/room/window", { windowOpen: room3dState.window.isOpen });
};

// --- Camera View Presets ---
window.setCameraView3D = function(viewName) {
  document.querySelectorAll(".camera-btn").forEach(b => b.classList.remove("active"));
  const btn = document.getElementById("camBtn" + viewName);
  if (btn) btn.classList.add("active");

  isCameraAnimating = true;

  if (viewName === "Iso") {
    targetCamPos = new THREE.Vector3(9.5, 9.0, 11.5);
    targetControlsTarget = new THREE.Vector3(0, 2.2, 0);
  } else if (viewName === "AC") {
    targetCamPos = new THREE.Vector3(1.2, 5.0, -1.8);
    targetControlsTarget = new THREE.Vector3(0, 4.1, -4.8);
  } else if (viewName === "Fan") {
    targetCamPos = new THREE.Vector3(0, 3.2, 4.2);
    targetControlsTarget = new THREE.Vector3(0, 4.4, 0);
  } else if (viewName === "TV") {
    targetCamPos = new THREE.Vector3(0, 2.2, -1.2);
    targetControlsTarget = new THREE.Vector3(0, 1.8, -4.6);
  }
};

// --- HUD & State Updates ---
function update3dHUD() {
  const fan = room3dState.fan;
  const ac = room3dState.ac;
  const tv = room3dState.tv;
  const light = room3dState.light;
  const win = room3dState.window;

  // Total room wattage
  const totalW = fan.watts + ac.watts + tv.watts + light.watts + (win.isOpen && ac.status === 'on' ? 400 : 0);
  const carbonRate = ((totalW * 0.82) / 60).toFixed(1);

  // Update UI Elements
  const wattsEl = document.getElementById("hudWatts3d");
  if (wattsEl) wattsEl.textContent = totalW + " W";

  const rateEl = document.getElementById("hudCarbon3d");
  if (rateEl) rateEl.textContent = carbonRate + " g/min";

  // Fan button
  const fanBtn = document.getElementById("btnFan3d");
  if (fanBtn) {
    fanBtn.textContent = fan.status === "on" ? "Fan: ON (Spinning)" : "Fan: OFF";
    fanBtn.className = fan.status === "on" ? "dock-switch-btn on" : "dock-switch-btn";
  }

  // AC button
  const acBtn = document.getElementById("btnAc3d");
  if (acBtn) {
    acBtn.textContent = ac.status === "on" ? `AC: ON (${ac.temp}°C)` : "AC: OFF";
    acBtn.className = ac.status === "on" ? "dock-switch-btn on" : "dock-switch-btn";
  }

  // TV button
  const tvBtn = document.getElementById("btnTv3d");
  if (tvBtn) {
    if (tv.status === "on") {
      tvBtn.textContent = "TV: Active (120W)";
      tvBtn.className = "dock-switch-btn on";
    } else if (tv.status === "standby") {
      tvBtn.textContent = "TV: Standby (15W Red LED)";
      tvBtn.className = "dock-switch-btn standby";
    } else {
      tvBtn.textContent = "TV: OFF (0W)";
      tvBtn.className = "dock-switch-btn";
    }
  }

  // Light button
  const lightBtn = document.getElementById("btnLight3d");
  if (lightBtn) {
    lightBtn.textContent = light.status === "on" ? "Light: ON" : "Light: OFF";
    lightBtn.className = light.status === "on" ? "dock-switch-btn on" : "dock-switch-btn";
  }

  // Window button
  const winBtn = document.getElementById("btnWindow3d");
  if (winBtn) {
    winBtn.textContent = win.isOpen ? "Window: Open ⚠️" : "Window: Sealed ✓";
    winBtn.className = win.isOpen ? "dock-switch-btn standby" : "dock-switch-btn";
  }

  // Visual 3D Component State Updates
  if (roomPointLight) {
    roomPointLight.intensity = light.status === "on" ? 1.25 : 0.04;
    ceilingLightFixture.material.color.setHex(light.status === "on" ? 0xfef08a : 0x334155);
  }

  if (acLouver) {
    acLouver.rotation.x = ac.status === "on" ? 0.45 : 0;
  }

  if (acBreezeParticles) {
    acBreezeParticles.visible = ac.status === "on";
  }

  if (tvLedMesh && tvRedLight) {
    if (tv.status === "on") {
      tvLedMesh.material.color.setHex(0x10b981);
      tvRedLight.intensity = 0;
    } else if (tv.status === "standby") {
      tvLedMesh.material.color.setHex(0xef4444);
      tvRedLight.intensity = 0.8;
    } else {
      tvLedMesh.material.color.setHex(0x334155);
      tvRedLight.intensity = 0;
    }
  }

  // Check Nudge Alert Banner
  const alertBanner = document.getElementById("nudgeBanner3d");
  if (alertBanner) {
    if (ac.status === "on" && win.isOpen) {
      alertBanner.classList.add("active");
      document.getElementById("nudgeText3d").textContent = "Critical Leak: Bedroom Window open while AC runs (+400W penalty)!";
      document.getElementById("nudgeFixBtn3d").textContent = "Seal Window";
      document.getElementById("nudgeFixBtn3d").onclick = () => toggleWindow3D();
    } else if (ac.status === "on" && ac.temp < 24) {
      alertBanner.classList.add("active");
      document.getElementById("nudgeText3d").textContent = `AC Set to ${ac.temp}°C! Nudge to BEE standard 24°C to save energy.`;
      document.getElementById("nudgeFixBtn3d").textContent = "Set 24°C";
      document.getElementById("nudgeFixBtn3d").onclick = () => setAcTemp3D(24);
    } else if (tv.status === "standby") {
      alertBanner.classList.add("active");
      document.getElementById("nudgeText3d").textContent = "Vampire Drain: TV drawing 15W standby power 24/7 (Notice pulsing red LED)!";
      document.getElementById("nudgeFixBtn3d").textContent = "Cut Power (0W)";
      document.getElementById("nudgeFixBtn3d").onclick = () => cycleTv3D();
    } else {
      alertBanner.classList.remove("active");
    }
  }
}

// --- Animation Loop ---
function animate3D() {
  requestAnimationFrame(animate3D);

  // 1. Smooth Fan Rotation
  fanSpeed += (targetFanSpeed - fanSpeed) * 0.05;
  if (fanBlades && fanSpeed > 0.001) {
    fanBlades.rotation.y += fanSpeed;
  }

  // 2. AC Particle Breeze Stream Animation
  if (acBreezeParticles && acBreezeParticles.visible) {
    const pos = acBreezeParticles.geometry.attributes.position.array;
    for (let i = 1; i < pos.length; i += 3) {
      pos[i] -= 0.045; // Move downward
      if (pos[i] < -2.2) {
        pos[i] = 0; // Reset to AC vent
      }
    }
    acBreezeParticles.geometry.attributes.position.needsUpdate = true;
  }

  // 3. Smart TV Broadcast Screen Animation
  if (room3dState.tv.status === "on") {
    tvAnimAngle += 3;
    updateTvCanvas();
    if (tvScreenTexture) tvScreenTexture.needsUpdate = true;
  }

  // 4. Vampire Standby Red LED Pulse
  if (room3dState.tv.status === "standby" && tvRedLight) {
    const pulse = (Math.sin(Date.now() * 0.006) + 1) * 0.4 + 0.2;
    tvRedLight.intensity = pulse;
  }

  // 5. Smooth Camera Preset Animation
  if (isCameraAnimating && targetCamPos && targetControlsTarget) {
    camera.position.lerp(targetCamPos, 0.05);
    controls.target.lerp(targetControlsTarget, 0.05);
    if (camera.position.distanceTo(targetCamPos) < 0.1) {
      isCameraAnimating = false;
    }
  }

  controls.update();
  renderer.render(scene, camera);
}

function onWindowResize() {
  const container = document.getElementById("threeCanvasContainer");
  if (!container || !renderer || !camera) return;
  const w = container.clientWidth;
  const h = container.clientHeight || (window.innerHeight - 60);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function syncBackend3D(url, payload) {
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).catch(() => {});
}

// Auto start when DOM ready
document.addEventListener("DOMContentLoaded", () => {
  init3D();
});
