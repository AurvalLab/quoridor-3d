const COPY = {
  en: {
    goal: 'Reach the opposite side before your opponent.',
    pickTitle: 'Pick up', pick: 'Pinch your thumb and index finger over your pawn or a fence in your box.',
    aimTitle: 'Move & turn', aim: 'Move your hand to aim. Follow a horizontal or vertical gap to turn a fence.',
    placeTitle: 'Place', place: 'Separate your fingers to place it. Green marks a legal move.',
    rulesTitle: 'Fence rules', rules: 'Each fence spans two squares. Ends may touch; fences cannot overlap or cross, and both pawns must keep a path to the goal.',
    machine: 'Versus machine', twoPlayers: 'Same device', online: 'Online duel', pointer: 'Mouse or touch',
    difficulty: 'AI difficulty', novice: 'Novice', average: 'Average', good: 'Challenging', hell: 'Hell', locked: 'Locked',
    privacy: 'Your camera picture stays on this device.',
    mouseHelp: 'Mouse / touch: drag and release. Right-click also turns a fence.',
    rotate: 'Turn fence', view: 'Switch view', start: 'Start', mute: 'Mute',
    camera: 'Use camera', starting: 'Starting camera…', controlsLabel: 'Control method',
    error: 'The camera is unavailable or was blocked. You can still play with mouse or touch.',
    modeLabel: 'Who plays', shortcutLabel: 'Keyboard shortcuts', languageLabel: 'Read instructions in Chinese',
  },
  'zh-CN': {
    goal: '让你的棋子先到达棋盘对岸。',
    pickTitle: '拿起', pick: '用拇指和食指捏住自己的棋子，或挡板盒里的挡板。',
    aimTitle: '移动与转向', aim: '移动手来对准位置；沿横向或竖向棋盘缝隙，自动调整挡板朝向。',
    placeTitle: '放下', place: '分开两根手指即可放下。绿色提示表示可以落子或放板。',
    rulesTitle: '挡板规则', rules: '每块挡板跨两个格子。端点可以相接，但不能重叠或交叉；必须为双方都留出通往终点的路径。',
    machine: '人机对弈', twoPlayers: '同机双人', online: '远程联机', pointer: '鼠标或触屏',
    difficulty: '人机难度', novice: '入门', average: '中等', good: '偏难', hell: '地狱', locked: '未解锁',
    privacy: '摄像头画面仅保留在本机。',
    mouseHelp: '鼠标或触屏：按住拖动，松开放下。右键也可旋转挡板。',
    rotate: '旋转挡板', view: '切换视角', start: '开始', mute: '静音',
    camera: '启用摄像头', starting: '正在启动摄像头…', controlsLabel: '操作方式',
    error: '摄像头不可用或权限被阻止。你仍可使用鼠标或触屏游玩。',
    modeLabel: '对弈模式', shortcutLabel: '键盘快捷键', languageLabel: 'Read instructions in English',
  },
};

export function setupInstructions(panel: HTMLElement) {
  let language: keyof typeof COPY = 'en';
  let cameraState: 'idle' | 'starting' | 'error' = 'idle';
  const toggle = panel.querySelector<HTMLButtonElement>('#b-language')!;
  const camera = panel.querySelector<HTMLButtonElement>('#b-cam')!;
  const paint = () => {
    const copy = COPY[language];
    panel.lang = language;
    for (const node of panel.querySelectorAll<HTMLElement>('[data-copy]')) node.textContent = copy[node.dataset.copy as keyof typeof copy];
    camera.textContent = cameraState === 'starting' ? copy.starting : copy.camera;
    camera.disabled = cameraState === 'starting';
    panel.querySelector<HTMLButtonElement>('#b-mouse')!.disabled = cameraState === 'starting';
    panel.querySelector('#err')!.textContent = cameraState === 'error' ? copy.error : '';
    panel.querySelector('.modes')!.setAttribute('aria-label', copy.modeLabel);
    panel.querySelector('.intro-shortcuts')!.setAttribute('aria-label', copy.shortcutLabel);
    toggle.textContent = language === 'en' ? '中文' : 'EN';
    toggle.lang = language === 'en' ? 'zh-CN' : 'en';
    toggle.setAttribute('aria-label', copy.languageLabel);
    panel.dispatchEvent(new Event('instructionschange'));
  };
  toggle.addEventListener('click', () => { language = language === 'en' ? 'zh-CN' : 'en'; paint(); });
  paint();
  return { setCameraState(state: typeof cameraState) { cameraState = state; paint(); } };
}
