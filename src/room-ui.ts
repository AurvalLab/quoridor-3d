import type { Online } from './online';

const COPY = {
  en: {
    create: 'Create a room', codeLabel: 'Or enter a room code', join: 'Join', room: 'Room', copy: 'Copy invite link', copyShort: 'Invite',
    leave: 'Leave room', rematch: 'Play again', working: 'Connecting…', reconnecting: 'Connection lost. Reconnecting…',
    readyHint: 'Choose your controls, then select Ready. Play starts when both players are ready.',
    startGame: 'Start game', prepare: 'Ready', cancelReady: 'Cancel ready',
    recovery: 'Keep this tab open. Refreshing reconnects; closing it may lose your seat.',
    waitingReady: 'You are ready. Waiting for your friend…', waitingFriend: 'Share the invite link with your friend.',
    you: 'You', friend: 'Friend', pale: 'Moon White', jade: 'Jade Green', empty: 'Waiting to join',
    ready: 'Ready', notReady: 'Not ready', offline: 'Offline', connected: 'Connected', sending: 'Sending move…',
    copied: 'Invite link copied.', copyFailed: 'Copy this link:',
    rematchHint: 'Both players must choose Play again.', rematchWait: 'Rematch requested. Waiting for your friend…',
    friendRematch: 'Your friend wants to play again.',
    errors: {
      full: 'This room already has two players. Create another room.', credentials: 'This tab cannot recover that seat. Return to the original tab or create a room.',
      'not-found': 'Room not found. Check the room code.', code: 'Enter the six-character room code.',
      'not-ready': 'Wait until both players are ready.', 'opponent-offline': 'Your friend is offline. Play pauses until they reconnect.',
      'not-your-turn': 'Wait for your turn.', stale: 'The board updated. Try your move again.', illegal: 'That move is not legal.',
      over: 'This round has already started or ended.', message: 'The request was not accepted. Try again.', 'rate-limit': 'Too many requests. Wait a moment.',
      network: 'Could not reach the room service. Try again.', replaced: 'This seat opened in another tab. Continue there, or refresh this tab to reconnect.',
      storage: 'Your browser cannot save this seat. Refresh recovery is unavailable.',
      unavailable: 'The move could not be saved. Try again.',
      'side-locked': 'Cancel ready before switching sides. Sides are locked during play.',
    },
  },
  zh: {
    create: '创建房间', codeLabel: '或输入房间号', join: '加入', room: '房间', copy: '复制邀请链接', copyShort: '邀请',
    leave: '离开房间', rematch: '再来一局', working: '正在连接…', reconnecting: '连接中断，正在重连…',
    readyHint: '选择操作方式后点击“准备”。双方准备后自动开始。',
    startGame: '开始对局', prepare: '准备', cancelReady: '取消准备',
    recovery: '刷新可恢复对局，请保留此标签页；关闭后可能丢失席位。',
    waitingReady: '你已准备，等待好友…', waitingFriend: '将邀请链接发给好友，即可加入。',
    you: '你', friend: '好友', pale: '月牙白', jade: '翡翠绿', empty: '等待加入',
    ready: '已准备', notReady: '未准备', offline: '已离线', connected: '已连接', sending: '正在提交落子…',
    copied: '已复制邀请链接。', copyFailed: '请复制此链接：',
    rematchHint: '双方选择“再来一局”后开始。', rematchWait: '已请求重开，等待好友…', friendRematch: '好友希望再来一局。',
    errors: {
      full: '房间已有两位玩家，请创建新房间。', credentials: '此标签页无法恢复玩家席位，请返回原标签页或创建新房间。',
      'not-found': '未找到房间，请检查房间号。', code: '请输入六位房间号。',
      'not-ready': '请等待双方准备。', 'opponent-offline': '好友已离线，对局暂停，重连后继续。',
      'not-your-turn': '请等待你的回合。', stale: '棋盘已更新，请重新操作。', illegal: '此处不能落子或放板。',
      over: '本局已经开始或结束。', message: '请求未被接受，请重试。', 'rate-limit': '操作过于频繁，请稍候。',
      network: '无法连接房间服务，请重试。', replaced: '此席位已在另一标签页打开，请在那里继续，或刷新此页重新连接。',
      storage: '浏览器无法保存席位凭证，刷新后将无法恢复。',
      unavailable: '落子未能保存，请重试。',
      'side-locked': '请先取消准备再切换阵营，对局中无法切换。',
    },
  },
};

export function setupRoomUI(online: Online, leave: () => void, controls: () => { choice: 'camera' | 'pointer'; ready: boolean; busy: boolean }) {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const panel = $('title');
  let notice = '';
  const copy = () => panel.lang === 'zh-CN' ? COPY.zh : COPY.en;
  const invitation = () => { const url = new URL(location.href); url.search = ''; url.searchParams.set('room', online.session!.code); return url.href; };
  const render = () => {
    const c = copy(), session = online.session, state = online.state, input = controls();
    for (const node of document.querySelectorAll<HTMLElement>('[data-room-copy]')) node.textContent = c[node.dataset.roomCopy as keyof Omit<typeof c, 'errors'>];
    $('room-entry').classList.toggle('hidden', !!session);
    $('room-waiting').classList.toggle('hidden', !session);
    $('b-create-room').toggleAttribute('disabled', online.busy);
    $('b-join-room').toggleAttribute('disabled', online.busy);
    $('room-code').toggleAttribute('disabled', online.busy);
    $('room-number').textContent = session?.code ?? '';
    if (session && state) {
      for (const p of [0, 1] as const) {
        const name = `${session.player === p ? c.you : c.friend} · ${state.sides[p] === 0 ? c.pale : c.jade}`;
        const status = !state.joined[p] ? c.empty : !state.connected[p] ? c.offline : state.ready[p] ? c.ready : c.notReady;
        $('room-seat-' + p).textContent = `${name} — ${status}`;
      }
      $('room-ready-hint').textContent = state.ready[session.player] ? c.waitingReady
        : !state.joined[1] ? c.waitingFriend + ' ' + c.readyHint : c.readyHint;
      $('room-bar-label').textContent = `${c.room} ${session.code} · ${online.player === 0 ? c.pale : c.jade}`;
      $('rematch-status').textContent = state.rematch[session.player] ? c.rematchWait
        : state.rematch[1 - session.player] ? c.friendRematch : c.rematchHint;
      $('b-rematch').toggleAttribute('disabled', !online.connected || online.pending || !state.connected.every(Boolean) || state.rematch[session.player]);
    }
    const error = online.error ? c.errors[online.error] ?? c.errors.network : '';
    const status = online.busy ? c.working : online.error === 'network' && session ? c.reconnecting : error;
    $('room-feedback').textContent = status || notice;
    $('room-bar-status').textContent = status || (state && !state.connected.every(Boolean) ? c.errors['opponent-offline'] : online.pending ? c.sending : notice);
    $('room-bar').classList.toggle('hidden', !session || !state || state.game.phase === 'title');
    const remote = panel.classList.contains('online-selected');
    const ownReady = !!session && !!state?.ready[session.player];
    $('control-options').classList.toggle('hidden', remote && !session);
    $('control-options').toggleAttribute('disabled', remote && (ownReady || !online.connected || online.pending));
    $('b-cam').setAttribute('aria-pressed', String(input.choice === 'camera'));
    $('b-mouse').setAttribute('aria-pressed', String(input.choice === 'pointer'));
    $('b-start').classList.toggle('hidden', remote && !session);
    $('b-start').textContent = remote ? (ownReady ? c.cancelReady : c.prepare) : c.startGame;
    $('b-start').toggleAttribute('disabled', input.busy || (!ownReady && !input.ready) || (remote && (!online.connected || online.pending)));
    $('online-results').classList.toggle('hidden', !session);
    $('results').querySelector(':scope > .small')!.classList.toggle('hidden', !!session);
  };
  $('b-create-room').addEventListener('click', () => { notice = ''; void online.open(); });
  $('room-join').addEventListener('submit', e => { e.preventDefault(); notice = ''; void online.open($<HTMLInputElement>('room-code').value); });
  for (const id of ['b-lobby-leave', 'b-bar-leave', 'b-results-leave']) $(id).addEventListener('click', () => { notice = ''; leave(); render(); });
  for (const id of ['b-copy-room', 'b-bar-copy']) $(id).addEventListener('click', async () => {
    if (!online.session) return;
    try { await navigator.clipboard.writeText(invitation()); notice = copy().copied; }
    catch { notice = `${copy().copyFailed} ${invitation()}`; }
    render();
  });
  $('b-rematch').addEventListener('click', () => { online.command({ type: 'rematch' }); });
  panel.addEventListener('instructionschange', () => { notice = ''; render(); });
  return { render };
}
