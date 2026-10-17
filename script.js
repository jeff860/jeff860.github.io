(function(){
  const clientIdInput = document.getElementById('clientIdInput');
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const statusLine = document.getElementById('statusLine');
  const errMsg = document.getElementById('errMsg');
  const progressBar = document.getElementById('progressBar');
  const progressFill = document.getElementById('progressFill');
  const tabbar = document.getElementById('tabbar');
  const stats = document.getElementById('stats');
  const controls = document.getElementById('controls');
  const metaRow = document.getElementById('metaRow');
  const metaLeft = document.getElementById('metaLeft');
  const listEl = document.getElementById('list');
  const emptyHint = document.getElementById('emptyHint');
  const pager = document.getElementById('pager');
  const pagerTop = document.getElementById('pagerTop');
  const searchInput = document.getElementById('searchInput');
  const channelQueryInput = document.getElementById('channelQueryInput');
  const regionSelect = document.getElementById('regionSelect');
  const channelSelect = document.getElementById('channelSelect');
  const sortSelect = document.getElementById('sortSelect');
  const navModeSelect = document.getElementById('navModeSelect');
  const resultCount = document.getElementById('resultCount');
  const dataSourceBadge = document.getElementById('dataSourceBadge');
  const totalVideoCount = document.getElementById('totalVideoCount');
  const resetBtn = document.getElementById('resetBtn');

  const DB_NAME = 'MyTubeDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'cacheStore';

  let currentAccountId = 'default'; // 지금 화면에 보여주고 있는 데이터의 계정 (임시 데이터 or 저장된 데이터)
  let currentAccountName = null; // 위 계정의 표시용 이름(예: 'Dad'). 실제 "저장" 전까지는 IndexedDB에 쓰지 않는다.
  let liveAccountId = sessionStorage.getItem('yt_live_account_id') || null; // 이번 탭에서 로그인으로 식별된 "임시 데이터"의 계정(저장 여부와 무관하게 유지)
  let liveAccountName = sessionStorage.getItem('yt_live_account_name') || null;
  let liveAccountSaved = sessionStorage.getItem('yt_live_account_saved') === '1'; // 저장하고 나면 "임시 데이터" 줄은 목록에서 숨긴다

  async function getAccountList() {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get('global_account_list');
      req.onsuccess = () => resolve(req.result || ['default']);
    });
  }
  
  async function addAccount(accountId, accountName = null) {
    let list = await getAccountList();
    
    // Support either old string-only items or new {id, name} objects
    let existingIndex = list.findIndex(item => {
      if (typeof item === 'object') {
        return item.id === accountId;
      }
      return item === accountId;
    });

    if (existingIndex === -1) {
        list.push({ id: accountId, name: accountName || accountId });
        const db = await getDB();
        return new Promise((resolve) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          store.put(list, 'global_account_list');
          tx.oncomplete = () => {
            updateAccountList(list);
            resolve();
          };
        });
    } else {
        // Update name if it wasn't set or has changed
        let item = list[existingIndex];
        if (typeof item === 'object' && accountName && item.name !== accountName) {
            item.name = accountName;
            const db = await getDB();
            return new Promise((resolve) => {
              const tx = db.transaction(STORE_NAME, 'readwrite');
              const store = tx.objectStore(STORE_NAME);
              store.put(list, 'global_account_list');
              tx.oncomplete = () => {
                updateAccountList(list);
                resolve();
              };
            });
        }
    }
  }

  async function updateAccountList(list) {
    const listEl = document.getElementById('accountList');
    const container = document.getElementById('accountContainer');
    const savedSection = document.getElementById('savedAccountsSection');

    const actualAccounts = list.filter(item => (typeof item === 'object' ? item.id : item) !== 'default');

    const rows = [];
    if (liveAccountId && !liveAccountSaved) {
        rows.push({ id: '__temp__', name: liveAccountName || liveAccountId, timestamp: null, isTemp: true });
    }
    actualAccounts.forEach(item => {
        rows.push({ id: item.id, name: item.name, timestamp: item.timestamp, isTemp: false });
    });

    for (const row of rows) {
        let c = {};
        try {
            if (row.isTemp) {
                c = JSON.parse(sessionStorage.getItem('yt_session_cache') || 'null') || {};
            } else {
                c = (await dbGetFor(row.id, 'yt_cache')) || {};
            }
        } catch(e) { c = {}; }
        row.videoCount = (c.all && c.all.length) || (c.liked && c.liked.length) || 0;
        row.subCount = (c.subscriptions && c.subscriptions.length) || 0;
    }

    if (rows.length > 0) {
        listEl.innerHTML = rows.map(row => `
            <div style="margin-bottom:8px; display:flex; align-items:center; border-bottom: 1px solid var(--hover); padding-bottom: 5px;">
                <input type="checkbox" value="${row.id}" id="acct_${row.id}" ${selectedAccountIds.has(row.id) ? 'checked' : ''} style="margin-right:8px;">
                <label for="acct_${row.id}" style="flex-grow:1; cursor:pointer;">
                    ${row.isTemp ? '🧠 ' : ''}${escapeHtml(row.name)}${row.isTemp ? ' - 임시 데이터' : ' - ' + (row.timestamp || '저장안됨')}
                    <span ${row.isTemp ? 'id="tempCountsSpan"' : ''} style="color:var(--text-dim); font-size:11px;"> · 영상 ${row.videoCount.toLocaleString()}개 · 구독 ${row.subCount.toLocaleString()}개</span>
                </label>
                ${row.isTemp
                    ? `<button class="primary" onclick="saveCurrentData()" style="margin-left:8px; white-space:nowrap; font-size:12px; padding:4px 10px;">현재 데이터 저장</button>`
                    : `<button onclick="deleteAccount('${row.id}', '${escapeHtml(row.name)}')" style="background:#cc0000; color:white; border:none; padding:2px 8px; border-radius:4px; font-size:11px; cursor:pointer; margin-left:8px;">삭제</button>`}
            </div>
        `).join('');
        savedSection.style.display = 'block';

        rows.forEach(row => {
            const cb = document.getElementById('acct_' + row.id);
            if (cb) {
                cb.addEventListener('change', (e) => {
                    if (e.target.checked) selectedAccountIds.add(row.id);
                    else selectedAccountIds.delete(row.id);
                    onSelectionChange();
                });
            }
        });
    } else {
        savedSection.style.display = 'none';
    }

    // 로그인 중이거나 임시 데이터가 남아있으면 저장 버튼을, 저장된 계정이 있으면 목록을 볼 수 있게 보여준다
    container.style.display = (accessToken || liveAccountId || actualAccounts.length > 0) ? 'block' : 'none';
  }

  // 체크박스 선택이 바뀔 때마다 선택된 데이터들을 합쳐서 다시 보여준다
  async function onSelectionChange(){
    if (selectedAccountIds.size === 0) {
      resetToEmptyState();
      return;
    }
    await loadMergedData(Array.from(selectedAccountIds));
    const onlyTemp = selectedAccountIds.size === 1 && selectedAccountIds.has('__temp__');
    viewingSelection = !onlyTemp; // 임시 데이터만 단독 선택했을 때만 탭 클릭 시 새로 불러올 수 있게 둔다
    lastDataSource = onlyTemp ? (cache.all && cache.all.length ? 'session' : 'network') : 'saved';
    mode = 'all';
    tabbar.style.display = 'flex';
    onDataReady();
  }

  // 체크박스로 선택된 계정(들)의 데이터를 읽어서 하나로 합친다. 각 항목에는 어느 계정 데이터인지 표시를 붙인다.
  async function loadMergedData(selectedIds){
    const merged = { liked: [], disliked: [], playlists: [], subscriptions: [], trending: {}, search: [], all: [] };
    const mergedPlaylistItems = {};
    const accountList = await getAccountList();

    for (const id of selectedIds) {
      let accCache = {};
      let accPlaylistItems = {};
      let accName;
      if (id === '__temp__') {
        try { accCache = JSON.parse(sessionStorage.getItem('yt_session_cache') || 'null') || {}; } catch(e) {}
        try { accPlaylistItems = JSON.parse(sessionStorage.getItem('yt_session_playlistItemsCache') || 'null') || {}; } catch(e) {}
        accName = liveAccountName || liveAccountId;
      } else {
        accCache = (await dbGetFor(id, 'yt_cache')) || {};
        accPlaylistItems = (await dbGetFor(id, 'yt_playlistItemsCache')) || {};
        const match = accountList.find(a => (typeof a === 'object' ? a.id : a) === id);
        accName = (match && typeof match === 'object') ? match.name : id;
      }

      ['liked', 'disliked', 'playlists', 'subscriptions', 'search'].forEach(key => {
        (accCache[key] || []).forEach(item => merged[key].push({ ...item, accountName: accName }));
      });
      (accCache.all || []).forEach(item => merged.all.push({ ...item, accountName: accName }));

      Object.entries(accCache.trending || {}).forEach(([region, regionItems]) => {
        if (!merged.trending[region]) merged.trending[region] = [];
        (regionItems || []).forEach(item => merged.trending[region].push({ ...item, accountName: accName }));
      });

      Object.entries(accPlaylistItems || {}).forEach(([plId, plItems]) => {
        if (!mergedPlaylistItems[plId]) mergedPlaylistItems[plId] = [];
        mergedPlaylistItems[plId].push(...(plItems || []).map(item => ({ ...item, accountName: accName })));
      });
    }

    cache = merged;
    playlistItemsCache = mergedPlaylistItems;
  }

  // 현재 화면에 떠 있는 데이터/화면을 모두 비우고 "선택 전" 상태로 되돌린다
  function resetToEmptyState(){
    cache = { liked: null, disliked: null, playlists: null, subscriptions: null, trending: {}, search: null, all: null };
    playlistItemsCache = {};
    filtered = [];
    lastDataSource = null;
    currentAccountId = 'default';
    currentAccountName = null;
    tabbar.style.display = 'none';
    stats.style.display = 'none';
    controls.style.display = 'none';
    metaRow.style.display = 'none';
    listEl.innerHTML = '';
    emptyHint.style.display = 'none';
    pager.style.display = 'none';
    pagerTop.style.display = 'none';
    if (dataSourceBadge) { dataSourceBadge.textContent = ''; dataSourceBadge.className = 'source-badge'; }
  }

  window.deleteAccount = async function(accountId, accountName) {
    if (!confirm(`정말 계정(${accountName})의 모든 데이터를 삭제할까요?`)) return;
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    let updatedList = null;

    // 트랜잭션 중간에 await하면(예: getAccountList() 재호출) 트랜잭션이 자동 커밋되어
    // 이후 store.put()이 조용히 실패한다. 그래서 같은 트랜잭션 안에서 읽기/쓰기를 모두 끝낸다.
    const keysReq = store.getAllKeys();
    keysReq.onsuccess = () => {
        keysReq.result.forEach(key => {
            if (String(key).startsWith(accountId + '_')) {
                store.delete(key);
            }
        });
    };

    const listReq = store.get('global_account_list');
    listReq.onsuccess = () => {
        const list = listReq.result || ['default'];
        updatedList = list.filter(item => {
            const id = (typeof item === 'object') ? item.id : item;
            return id !== accountId;
        });
        store.put(updatedList, 'global_account_list');
    };

    tx.oncomplete = async () => {
        alert('데이터와 계정 정보가 삭제되었습니다.');
        // 지금 선택(체크)되어 보고 있던 계정이었을 때만 화면에서도 제거한다 (다른 걸 보고 있었다면 그대로 유지)
        const wasSelected = selectedAccountIds.has(accountId);
        selectedAccountIds.delete(accountId);
        await updateAccountList(updatedList || []);
        if (wasSelected) {
            await onSelectionChange();
        }
    };
    tx.onerror = () => { showError('삭제 중 오류가 발생했어요.'); };
  };

  function getAccountId() {
    return currentAccountId;
  }

  function getDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE_NAME);
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async function dbGet(key) {
    const db = await getDB();
    const accountId = getAccountId();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(accountId + '_' + key);
      req.onsuccess = () => resolve(req.result);
    });
  }

  async function dbSet(key, value) {
    const db = await getDB();
    const accountId = getAccountId();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(value, accountId + '_' + key);
      tx.oncomplete = () => resolve();
    });
  }

  // 특정 계정 id를 지정해서 읽는 버전 (여러 계정을 동시에 합쳐 볼 때 사용)
  async function dbGetFor(accountId, key) {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(accountId + '_' + key);
      req.onsuccess = () => resolve(req.result);
    });
  }

  let tokenClient = null;
  let accessToken = sessionStorage.getItem('yt_access_token') || null;
  let tokenExpiresAt = parseInt(sessionStorage.getItem('yt_token_expires_at'), 10) || null;
  let tokenCountdownTimer = null;
  let cache = { liked: null, disliked: null, playlists: null, subscriptions: null, trending: {}, search: null, all: null };
  let playlistItemsCache = {};
  let currentPlaylist = null;
  let filtered = [];
  let lastDataSource = null; // 'network' = API에서 새로 받아옴(세션저장), 'session' = 이번 세션 캐시(sessionStorage), 'saved' = 저장된 IndexedDB 데이터
  let selectedAccountIds = new Set(); // 체크박스로 선택된 데이터 소스들 ('__temp__' 또는 저장된 계정 id), 여러 개 동시 선택 가능
  let viewingSelection = false; // true면 선택된 데이터를 합쳐서 보여주는 중(탭 전환 시 새로 불러오지 않음)
  let sessionCacheQuotaWarned = false;
  let page = 1;
  let visibleCount = 20;
  const PAGE_SIZE = 30;
  let observer;

  function showError(msg){ errMsg.style.display='block'; errMsg.textContent = msg; }
  function clearError(){ errMsg.style.display='none'; errMsg.textContent=''; }
  function setStatus(msg){ statusLine.style.display = msg ? 'block' : 'none'; statusLine.textContent = msg; }
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  function getTimestamp(){
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${yy}.${pad(d.getMonth()+1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  // 불러온 데이터는 '저장'을 누르기 전까지 sessionStorage에만 머문다 (탭/브라우저 닫으면 삭제)
  function saveSessionCache(){
    try {
      sessionStorage.setItem('yt_session_cache', JSON.stringify(cache));
      sessionStorage.setItem('yt_session_playlistItemsCache', JSON.stringify(playlistItemsCache));
      refreshTempRowCounts();
    } catch(e) {
      if (!sessionCacheQuotaWarned) {
        sessionCacheQuotaWarned = true;
        showError('⚠️ 불러온 데이터가 너무 많아서 세션에 임시 저장할 수 없어요. 지금 화면은 그대로 보이지만, 새로고침하면 다시 불러와야 해요. 필요하면 "현재 데이터 저장" 버튼으로 브라우저에 영구 저장하세요.');
      }
    }
  }

  // "임시 데이터" 줄의 영상/구독 개수 표시만 다시 계산한다 (체크박스 목록 전체를 다시 그리지 않고 그 자리에서 갱신)
  function refreshTempRowCounts(){
    const span = document.getElementById('tempCountsSpan');
    if (!span) return;
    const videoCount = (cache.all && cache.all.length) || (cache.liked && cache.liked.length) || 0;
    const subCount = (cache.subscriptions && cache.subscriptions.length) || 0;
    span.textContent = ' · 영상 ' + videoCount.toLocaleString() + '개 · 구독 ' + subCount.toLocaleString() + '개';
  }

  function restoreSessionCache(){
    try {
      const c = sessionStorage.getItem('yt_session_cache');
      const p = sessionStorage.getItem('yt_session_playlistItemsCache');
      if (c) cache = JSON.parse(c);
      if (p) playlistItemsCache = JSON.parse(p);
    } catch(e) { /* 손상된 데이터는 무시 */ }
  }

  function clearSessionCache(){
    sessionStorage.removeItem('yt_session_cache');
    sessionStorage.removeItem('yt_session_playlistItemsCache');
    sessionCacheQuotaWarned = false;
  }

  function startTokenCountdown(){
    if (tokenCountdownTimer) clearInterval(tokenCountdownTimer);
    updateTokenCountdownLabel();
    tokenCountdownTimer = setInterval(updateTokenCountdownLabel, 1000);
  }

  function stopTokenCountdown(){
    if (tokenCountdownTimer) { clearInterval(tokenCountdownTimer); tokenCountdownTimer = null; }
    logoutBtn.textContent = '로그아웃';
  }

  function updateTokenCountdownLabel(){
    if (!accessToken || !tokenExpiresAt) { stopTokenCountdown(); return; }
    const remainMs = tokenExpiresAt - Date.now();
    if (remainMs <= 0) { onTokenExpired(); return; }
    const totalSec = Math.floor(remainMs / 1000);
    const mm = Math.floor(totalSec / 60);
    const ss = totalSec % 60;
    logoutBtn.textContent = `로그아웃 (${mm}:${String(ss).padStart(2,'0')} 후 토큰 만료)`;
  }

  function onTokenExpired(){
    stopTokenCountdown();
    accessToken = null;
    tokenExpiresAt = null;
    sessionStorage.removeItem('yt_access_token');
    sessionStorage.removeItem('yt_token_expires_at');
    loginBtn.style.display = 'inline-block';
    logoutBtn.style.display = 'none';
    showError('로그인 토큰이 만료됐어요. 다시 로그인해 주세요. (지금까지 불러온 데이터는 그대로 볼 수 있어요)');
  }

  function parseDuration(iso) {
    if (!iso) return '';
    const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return '';
    const h = parseInt(match[1] || 0, 10);
    const m = parseInt(match[2] || 0, 10);
    const s = parseInt(match[3] || 0, 10);
    const secStr = s < 10 ? '0' + s : s;
    if (h > 0) {
      const minStr = m < 10 ? '0' + m : m;
      return `${h}:${minStr}:${secStr}`;
    }
    return `${m}:${secStr}`;
  }

  function parseDurationToSec(iso) {
    if (!iso) return 0;
    const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    return (parseInt(match[1]||0,10)*3600) + (parseInt(match[2]||0,10)*60) + parseInt(match[3]||0,10);
  }

  function fmtCount(num) {
    if (!num) return null;
    const n = parseInt(num, 10);
    if (isNaN(n)) return null;
    if (n >= 100000000) return (n / 100000000).toFixed(1) + '억';
    if (n >= 10000) return (n / 10000).toFixed(1) + '만';
    if (n >= 1000) return (n / 1000).toFixed(1) + '천';
    return n.toLocaleString();
  }

  function fmtDates(createdIso, addedIso, viewCount, likeCount, defaultBadge = '정보 없음'){
    const lines = [];
    if(createdIso){
      const d = new Date(createdIso);
      if(!isNaN(d)) lines.push('생성: ' + d.toLocaleDateString('ko-KR', {year:'2-digit', month:'2-digit', day:'2-digit'}));
    }
    if(addedIso){
      const d = new Date(addedIso);
      if(!isNaN(d)) lines.push('추가: ' + d.toLocaleDateString('ko-KR', {year:'2-digit', month:'2-digit', day:'2-digit'}));
    }
    const views = fmtCount(viewCount);
    if (views) lines.push('조회: ' + views);
    const likes = fmtCount(likeCount);
    if (likes) lines.push('좋아요: ' + likes);

    return lines.length > 0 ? lines.join(' · ') : defaultBadge;
  }

  function pushNavState(targetMode, targetPl = null, targetCh = null){
    history.pushState({ mode: targetMode, playlist: targetPl, channel: targetCh }, '');
  }

  window.addEventListener('popstate', (e)=>{
    if(!accessToken) return;
    if(e.state){
      mode = e.state.mode;
      currentPlaylist = e.state.playlist;
      setActiveTab(mode === 'playlistItems' ? 'playlists' : mode);
      lastDataSource = 'session';
      onDataReady();
    }else{
      loadTab('all', false);
    }
  });

  window.addEventListener('DOMContentLoaded', async ()=>{
    const theme = await dbGet('theme');
    if (theme === 'light') {
      document.documentElement.classList.add('light');
    }
    
    // Init account list
    const accounts = await getAccountList();
    updateAccountList(accounts);

    // Setup Sentinel for Infinite Scroll
    const sentinel = document.createElement('div');
    sentinel.id = 'list-sentinel';
    listEl.parentNode.insertBefore(sentinel, listEl.nextSibling);
    observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
           if (navModeSelect && navModeSelect.value !== 'pagination' && filtered.length > visibleCount) {
              visibleCount += 20;
              render();
           }
        }
    }, { rootMargin: '200px' });
    observer.observe(sentinel);

    // 같은 탭에서 새로고침한 경우: sessionStorage에 남아있는 로그인 세션을 복원
    if (accessToken && tokenExpiresAt && tokenExpiresAt > Date.now() && liveAccountId) {
      currentAccountId = liveAccountId;
      currentAccountName = liveAccountName;
      restoreSessionCache();
      selectedAccountIds = new Set(['__temp__']);
      viewingSelection = false;
      loginBtn.style.display = 'none';
      logoutBtn.style.display = 'inline-block';
      tabbar.style.display = 'flex';
      startTokenCountdown();
      await updateAccountList(await getAccountList());
      if (cache.all) {
        mode = 'all';
        lastDataSource = 'session';
        onDataReady();
      } else {
        loadTab('all', false);
      }
      history.replaceState({ mode: 'all', playlist: null, channel: null }, '');
    } else {
      if (accessToken) {
        // 토큰이 만료된 채로 남아있던 경우: 정리
        accessToken = null;
        tokenExpiresAt = null;
        liveAccountId = null;
        liveAccountName = null;
        sessionStorage.removeItem('yt_access_token');
        sessionStorage.removeItem('yt_token_expires_at');
        sessionStorage.removeItem('yt_live_account_id');
        sessionStorage.removeItem('yt_live_account_name');
      }
      loginBtn.style.display = 'inline-block';
      logoutBtn.style.display = 'none';
    }
  });

  // "현재 데이터 저장"은 화면에 지금 합쳐서 보여주는 데이터가 아니라, 항상 이번 탭의 "임시 데이터"(sessionStorage) 자체를 저장한다.
  // 그래야 여러 계정을 체크해서 합쳐 보는 중에 눌러도 다른 계정 데이터가 섞여서 저장되지 않는다.
  window.saveCurrentData = async function(){
      if (!liveAccountId) {
          alert('계정이 식별되어야 저장할 수 있어요. 먼저 "불러오기"로 로그인해 주세요.');
          return;
      }
      const ok = confirm('⚠️ 이 데이터를 브라우저(IndexedDB)에 저장하면, 삭제하기 전까지 같은 PC/브라우저를 쓰는 다른 사람도 볼 수 있습니다.\n개인 PC에서만 저장하세요.\n\n계속 저장하시겠습니까?');
      if (!ok) return;

      const emptyCache = { liked: null, disliked: null, playlists: null, subscriptions: null, trending: {}, search: null, all: null };
      let tempCache, tempPlaylistItems;
      try { tempCache = JSON.parse(sessionStorage.getItem('yt_session_cache') || 'null') || emptyCache; } catch(e) { tempCache = emptyCache; }
      try { tempPlaylistItems = JSON.parse(sessionStorage.getItem('yt_session_playlistItemsCache') || 'null') || {}; } catch(e) { tempPlaylistItems = {}; }

      const timestamp = getTimestamp();
      let list = await getAccountList();
      const existing = list.find(a => (typeof a === 'object' ? a.id : a) === liveAccountId);
      if (existing && typeof existing === 'object') {
          existing.timestamp = timestamp;
      } else if (!existing) {
          list.push({ id: liveAccountId, name: liveAccountName || liveAccountId, timestamp: timestamp });
      }
      const db = await getDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(list, 'global_account_list');
      store.put(tempCache, liveAccountId + '_yt_cache');
      store.put(tempPlaylistItems, liveAccountId + '_yt_playlistItemsCache');
      tx.oncomplete = async () => {
          alert('저장되었습니다. (' + timestamp + ')');
          liveAccountSaved = true;
          sessionStorage.setItem('yt_live_account_saved', '1');
          // 내부 선택 상태도 "임시 데이터"에서 "저장된 데이터"로 바꿔준다. 그대로 두면 둘 다 선택된 것으로 남아
          // 같은 내용이 두 번 합쳐져서 검색결과/영상수가 중복으로 보인다.
          const wasTempSelected = selectedAccountIds.has('__temp__');
          selectedAccountIds.delete('__temp__');
          if (wasTempSelected) {
            selectedAccountIds.add(liveAccountId);
          }
          await updateAccountList(list);
          if (wasTempSelected) {
            await onSelectionChange();
          }
      };
  };

  function initTokenClient(){
    const clientId = clientIdInput.value.trim();
    return google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.force-ssl https://www.googleapis.com/auth/userinfo.email',
      callback: (resp)=>{
        if(resp.error){ handleAuthError(resp); return; }
        accessToken = resp.access_token;
        sessionStorage.setItem('yt_access_token', accessToken);
        tokenExpiresAt = Date.now() + (parseInt(resp.expires_in, 10) || 3600) * 1000;
        sessionStorage.setItem('yt_token_expires_at', String(tokenExpiresAt));
        startTokenCountdown();

        // 새 로그인은 항상 깨끗한 세션으로 시작 (이전 세션 데이터를 들고 오지 않음)
        cache = { liked: null, disliked: null, playlists: null, subscriptions: null, trending: {}, search: null, all: null };
        playlistItemsCache = {};
        clearSessionCache();
        selectedAccountIds = new Set(['__temp__']);
        viewingSelection = false;
        liveAccountSaved = false;
        sessionStorage.removeItem('yt_live_account_saved');

        loginBtn.style.display = 'none';
        logoutBtn.style.display = 'inline-block';
        clearError();
        tabbar.style.display = 'flex';

        // 계정 식별이 끝난 뒤에 데이터를 불러온다 (순서를 보장해야 "저장"에 쓸 계정ID가 확실히 세팅됨)
        (async () => {
          try {
            const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: 'Bearer ' + accessToken }
            });
            const userInfo = await userInfoRes.json();
            console.log('--- [STAGE 1: Account Selection] ---');
            console.log('Detected Account:', userInfo.email);

            // Check if it's a primary account
            if (userInfo.email && !userInfo.email.endsWith('@pages.plusgoogle.com')) {
                sessionStorage.setItem('yt_primary_email', userInfo.email);
                console.log('Primary email saved:', userInfo.email);
            }

            const channelsRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
                headers: { Authorization: 'Bearer ' + accessToken }
            });
            const data = await channelsRes.json();
            console.log('--- [STAGE 2: Brand Account Details] ---');
            console.log('Channel Data:', data);

            if (data.items && data.items.length > 0) {
                const channelId = data.items[0].id;
                const channelTitle = data.items[0].snippet.title; // Get user-friendly name
                console.log('Final Account ID generated:', channelId, 'with name:', channelTitle);

                liveAccountId = channelId;
                liveAccountName = channelTitle;
                sessionStorage.setItem('yt_live_account_id', liveAccountId);
                sessionStorage.setItem('yt_live_account_name', liveAccountName);
                currentAccountId = liveAccountId;
                currentAccountName = liveAccountName;
                // "저장" 버튼을 눌러야만 계정이 실제로 IndexedDB 목록에 등록된다 (불러오기만으로는 등록 안 함)
                await updateAccountList(await getAccountList());
            } else {
                showError('채널 정보를 확인하지 못했어요. "현재 데이터 저장"이 제한될 수 있어요.');
            }
          } catch (e) {
            showError('계정 정보를 불러오는 중 오류가 발생했어요. "현재 데이터 저장"이 제한될 수 있어요.');
          }

          loadTab('all', false);
          history.replaceState({ mode: 'all', playlist: null, channel: null }, '');
        })();
      },
      error_callback: handleAuthError
    });
  }

  function handleAuthError(err){
    const type = (err && (err.type || err.error)) || '';
    if(/popup_closed|access_denied/i.test(type)){
      showError('로그인 창이 닫혔거나 권한이 거부됐어요. 다시 시도해 주세요.');
    }else if(/redirect_uri_mismatch|origin/i.test(type)){
      showError('현재 주소가 OAuth 클라이언트의 "승인된 자바스크립트 원본"에 등록돼 있지 않아요.');
    }else{
      showError('로그인 중 오류가 발생했어요: ' + (type || '알 수 없는 오류') + '.');
    }
  }

  loginBtn.addEventListener('click', ()=>{
    clearError();
    if(location.protocol === 'file:'){
      showError('file:// 경로에서는 로그인이 동작하지 않아요. 터미널에서 python3 -m http.server 8000 을 실행한 뒤 http://localhost:8000 으로 접속해 주세요.');
      return;
    }
    tokenClient = initTokenClient();
    if(tokenClient) tokenClient.requestAccessToken({prompt: 'consent'});
  });

  logoutBtn.addEventListener('click', doReset);
  resetBtn.addEventListener('click', doReset);

  async function doReset(){
    if(accessToken && window.google && google.accounts && google.accounts.oauth2){
      google.accounts.oauth2.revoke(accessToken, ()=>{});
    }
    stopTokenCountdown();
    accessToken = null;
    tokenExpiresAt = null;
    sessionStorage.removeItem('yt_access_token');
    sessionStorage.removeItem('yt_token_expires_at');
    sessionStorage.removeItem('yt_live_account_id');
    sessionStorage.removeItem('yt_live_account_name');
    sessionStorage.removeItem('yt_live_account_saved');
    liveAccountId = null;
    liveAccountName = null;
    liveAccountSaved = false;
    clearSessionCache();

    // UI updates to reflect logged-out state
    loginBtn.style.display = 'inline-block';
    logoutBtn.style.display = 'none';

    // 임시 데이터 선택은 로그아웃과 함께 해제된다. 다른 저장된 데이터를 같이 선택해서 보고 있었다면 그건 그대로 둔다.
    selectedAccountIds.delete('__temp__');
    await updateAccountList(await getAccountList());
    if (selectedAccountIds.size > 0) {
      await onSelectionChange();
    } else {
      resetToEmptyState();
    }
    clearError();
  }

  document.querySelectorAll('.tabbar button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const targetTab = btn.dataset.tab;
      // 내 댓글 탭 클릭 시 바로 Google 활동 내역 페이지를 새 탭으로 연결
      if(targetTab === 'comments'){
        window.open('https://myactivity.google.com/page?hl=ko&utm_source=youtube&page=youtube_comments', '_blank');
        return;
      }
      currentPlaylist = null;
      loadTab(targetTab, true);
    });
  });

  function setActiveTab(tab){
    document.querySelectorAll('.tabbar button').forEach(b=>{
      if(b.dataset.tab !== 'comments'){
        b.classList.toggle('active', b.dataset.tab===tab);
      }
    });
  }

  async function loadTab(tab, pushHistory = true){
    mode = tab;
    setActiveTab(tab);
    clearError();
    if(pushHistory){
      pushNavState(tab, null, null);
    }
    if (viewingSelection) {
      // 저장된 데이터(또는 여러 개를 합쳐서) 보는 중에는 탭을 눌러도 새로 불러오지 않고, 이미 합쳐둔 데이터만 보여준다
      onDataReady();
      return;
    }
    if(tab === 'all'){
      if(!cache.all){ await fetchAll(); } else { lastDataSource = 'session'; onDataReady(); }
    }else if(tab === 'liked'){
      if(!cache.liked){ await fetchLiked(); } else { lastDataSource = 'session'; onDataReady(); }
    }else if(tab === 'disliked'){
      if(!cache.disliked){ await fetchDisliked(); } else { lastDataSource = 'session'; onDataReady(); }
    }else if(tab === 'playlists'){
      if(!cache.playlists){ await fetchPlaylists(); } else { lastDataSource = 'session'; onDataReady(); }
    }else if(tab === 'subscriptions'){
      if(!cache.subscriptions){ await fetchSubscriptions(); } else { lastDataSource = 'session'; onDataReady(); }
    }else if(tab === 'trending'){
      const region = regionSelect.value || 'KR';
      if(!cache.trending[region]){ await fetchTrending(region); } else { lastDataSource = 'session'; onDataReady(); }
    }else if(tab === 'search'){
      lastDataSource = 'session';
      onDataReady();
    }
  }

  async function apiPaginate(baseUrl, params, onPage, maxPages = 400){
    let pageToken = '';
    let guard = 0;
    let total = 0;
    do{
      const url = new URL(baseUrl);
      Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,v));
      if(pageToken) url.searchParams.set('pageToken', pageToken);
      const res = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } });
      if(res.status === 401) throw new Error('AUTH_EXPIRED');
      if(res.status === 403){
        const body = await res.json().catch(()=>({}));
        throw new Error('FORBIDDEN:' + (body.error && body.error.message ? body.error.message : ''));
      }
      if(!res.ok) throw new Error('HTTP_' + res.status);
      const data = await res.json();
      onPage(data.items || []);
      total += (data.items || []).length;
      pageToken = data.nextPageToken || '';
      setStatus('불러오는 중... ' + total.toLocaleString() + '건');
      progressFill.style.width = Math.min(95, 10 + total/20) + '%';
      guard++;
    } while(pageToken && guard < maxPages);
  }

  function beginLoad(){
    lastDataSource = 'network';
    clearError();
    progressBar.style.display = 'block';
    progressFill.style.width = '5%';
    setStatus('불러오는 중...');
  }
  function endLoad(){
    progressFill.style.width = '100%';
    setTimeout(()=>{ progressBar.style.display = 'none'; }, 300);
    setStatus('');
  }
  function handleLoadError(err){
    progressBar.style.display = 'none';
    setStatus('');
    if(err.message === 'AUTH_EXPIRED'){
      showError('로그인이 만료됐어요. 다시 로그인해 주세요.');
      stopTokenCountdown();
      accessToken = null;
      tokenExpiresAt = null;
      sessionStorage.removeItem('yt_access_token');
      sessionStorage.removeItem('yt_token_expires_at');
      logoutBtn.style.display = 'none';
      loginBtn.style.display = 'inline-block';
    }else if(err.message.startsWith('FORBIDDEN')){
      showError('접근이 거부됐어요 (403). API 활성화 여부와 테스트 사용자 등록 여부를 확인해 주세요.' + (err.message.split(':')[1] ? ' 상세: ' + err.message.split(':')[1] : ''));
    }else{
      showError('데이터를 불러오는 중 오류가 발생했어요 (' + err.message + ').');
    }
  }

  async function fetchLiked(){
    beginLoad();
    const items = [];
    try{
      await apiPaginate('https://www.googleapis.com/youtube/v3/videos',
        { part:'snippet,contentDetails,statistics', myRating:'like', maxResults:'50' },
        (batch)=>{ batch.forEach(item=>{
          const pubDate = item.snippet.publishedAt || '';
          const duration = parseDuration(item.contentDetails ? item.contentDetails.duration : '');
          const durationSec = parseDurationToSec(item.contentDetails ? item.contentDetails.duration : '');
          const viewCount = item.statistics ? item.statistics.viewCount : null;
          const likeCount = item.statistics ? item.statistics.likeCount : null;

          items.push({
            title: item.snippet.title,
            sub: item.snippet.channelTitle,
            thumb: (item.snippet.thumbnails && (item.snippet.thumbnails.medium || item.snippet.thumbnails.default) || {}).url || '',
            url: 'https://www.youtube.com/watch?v=' + item.id,
            videoId: item.id,
            duration, durationSec,
            badge: fmtDates(pubDate, null, viewCount, likeCount, 'LIKED'), 
            round:false, clickable:false, createdAt: pubDate
          });
        }); });
      cache.liked = items;
      saveSessionCache();
      endLoad();
      onDataReady();
    }catch(err){ handleLoadError(err); }
  }

  async function fetchAll(){
    beginLoad();
    const items = [];
    try{
      // 1. Fetch Liked
      const rawLiked = [];
      const likedVideoIds = [];
      await apiPaginate('https://www.googleapis.com/youtube/v3/videos',
        { part:'snippet,contentDetails,statistics', myRating:'like', maxResults:'50' },
        (batch)=>{ batch.forEach(item=>{
          rawLiked.push(item);
          likedVideoIds.push(item.id);
        }); });
      
      const likedDetailsMap = await fetchVideosDetails(likedVideoIds);
      const likedItems = rawLiked.map(item => {
        const det = likedDetailsMap[item.id] || {};
        return {
          title: item.snippet.title,
          sub: item.snippet.channelTitle,
          channelId: item.snippet.channelId,
          thumb: (item.snippet.thumbnails && (item.snippet.thumbnails.medium || item.snippet.thumbnails.default) || {}).url || '',
          url: 'https://www.youtube.com/watch?v=' + item.id,
          videoId: item.id,
          duration: det.duration || '',
          durationSec: det.durationSec || 0,
          badge: '출처: 좋아요 · ' + fmtDates(item.snippet.publishedAt, null, det.viewCount, det.likeCount, ''),
          source: '좋아요',
          createdAt: item.snippet.publishedAt
        };
      });
      cache.liked = likedItems;
      items.push(...likedItems);

      // 2. Fetch Disliked (탭 전환 시 다시 불러오지 않도록 함께 받아둠)
      const rawDisliked = [];
      await apiPaginate('https://www.googleapis.com/youtube/v3/videos',
        { part:'snippet,contentDetails,statistics', myRating:'dislike', maxResults:'50' },
        (batch)=>{ batch.forEach(item=>{ rawDisliked.push(item); }); });
      cache.disliked = rawDisliked.map(item => {
        const pubDate = item.snippet.publishedAt || '';
        const duration = parseDuration(item.contentDetails ? item.contentDetails.duration : '');
        const durationSec = parseDurationToSec(item.contentDetails ? item.contentDetails.duration : '');
        const viewCount = item.statistics ? item.statistics.viewCount : null;
        const likeCount = item.statistics ? item.statistics.likeCount : null;
        return {
          title: item.snippet.title,
          sub: item.snippet.channelTitle,
          thumb: (item.snippet.thumbnails && (item.snippet.thumbnails.medium || item.snippet.thumbnails.default) || {}).url || '',
          url: 'https://www.youtube.com/watch?v=' + item.id,
          videoId: item.id,
          duration, durationSec,
          badge: fmtDates(pubDate, null, viewCount, likeCount, '👎 싫어요'),
          round:false, clickable:false, createdAt: pubDate
        };
      });

      // 3. Fetch All Playlists (메타데이터 포함, '재생목록' 탭에서 바로 쓸 수 있게) and their Items
      const rawPlaylists = [];
      await apiPaginate('https://www.googleapis.com/youtube/v3/playlists',
        { part:'snippet,contentDetails', mine:'true', maxResults:'50' },
        (batch)=>{ batch.forEach(pl=>{ rawPlaylists.push(pl); }); });

      cache.playlists = rawPlaylists.map(pl => ({
        id: pl.id,
        title: pl.snippet.title,
        sub: (pl.contentDetails.itemCount || 0).toLocaleString() + '개 영상',
        thumb: (pl.snippet.thumbnails && (pl.snippet.thumbnails.medium || pl.snippet.thumbnails.default) || {}).url || '',
        badge: fmtDates(pl.snippet.publishedAt, null, null, null, '재생목록'), round:false, clickable:true
      }));

      for(const pl of rawPlaylists){
        const rawPlItems = [];
        const plVideoIds = [];
        await apiPaginate('https://www.googleapis.com/youtube/v3/playlistItems',
          { part:'snippet', playlistId: pl.id, maxResults:'50' },
          (batch)=>{ batch.forEach(item=>{
            const vid = item.snippet.resourceId ? item.snippet.resourceId.videoId : '';
            if(vid) {
              rawPlItems.push(item);
              plVideoIds.push(vid);
            }
          }); });
        
        const plDetailsMap = await fetchVideosDetails(plVideoIds);
        const plItems = rawPlItems.map(item => {
          const vid = item.snippet.resourceId ? item.snippet.resourceId.videoId : '';
          const det = plDetailsMap[vid] || {};
          return {
            title: item.snippet.title,
            sub: item.snippet.videoOwnerChannelTitle || item.snippet.channelTitle || '',
            channelId: item.snippet.videoOwnerChannelId || item.snippet.channelId || '',
            thumb: (item.snippet.thumbnails && (item.snippet.thumbnails.medium || item.snippet.thumbnails.default) || {}).url || '',
            url: vid ? 'https://www.youtube.com/watch?v=' + vid : '',
            videoId: vid,
            duration: det.duration || '',
            durationSec: det.durationSec || 0,
            badge: '출처: ' + pl.snippet.title + ' · ' + fmtDates(item.snippet.videoOwnerPublishedAt || '', item.snippet.publishedAt || '', det.viewCount, det.likeCount, ''),
            source: '재생목록: ' + pl.snippet.title,
            createdAt: item.snippet.publishedAt
          };
        });
        playlistItemsCache[pl.id] = plItems;
        items.push(...plItems);
      }

      // 4. Fetch Subscriptions ('구독' 탭에서 바로 쓸 수 있게 함께 받아둠)
      const subItems = [];
      await apiPaginate('https://www.googleapis.com/youtube/v3/subscriptions',
        { part:'snippet', mine:'true', maxResults:'50', order:'alphabetical' },
        (batch)=>{ batch.forEach(sub=>{
          const chId = sub.snippet.resourceId ? sub.snippet.resourceId.channelId : '';
          subItems.push({
            channelId: chId,
            title: sub.snippet.title,
            sub: sub.snippet.description ? sub.snippet.description.slice(0,120) : '',
            thumb: (sub.snippet.thumbnails && (sub.snippet.thumbnails.medium || sub.snippet.thumbnails.default) || {}).url || '',
            url: chId ? 'https://www.youtube.com/channel/' + chId : '',
            badge: fmtDates(sub.snippet.publishedAt, null, null, null, '구독'), round:true, clickable:false, isDesc:true
          });
        }); });
      cache.subscriptions = subItems;

      cache.all = items;
      saveSessionCache();
      endLoad();
      onDataReady();
    }catch(err){ handleLoadError(err); }
  }

  async function fetchDisliked(){
    beginLoad();
    const items = [];
    try{
      await apiPaginate('https://www.googleapis.com/youtube/v3/videos',
        { part:'snippet,contentDetails,statistics', myRating:'dislike', maxResults:'50' },
        (batch)=>{ batch.forEach(item=>{
          const pubDate = item.snippet.publishedAt || '';
          const duration = parseDuration(item.contentDetails ? item.contentDetails.duration : '');
          const durationSec = parseDurationToSec(item.contentDetails ? item.contentDetails.duration : '');
          const viewCount = item.statistics ? item.statistics.viewCount : null;
          const likeCount = item.statistics ? item.statistics.likeCount : null;

          items.push({
            title: item.snippet.title,
            sub: item.snippet.channelTitle,
            thumb: (item.snippet.thumbnails && (item.snippet.thumbnails.medium || item.snippet.thumbnails.default) || {}).url || '',
            url: 'https://www.youtube.com/watch?v=' + item.id,
            videoId: item.id,
            duration, durationSec,
            badge: fmtDates(pubDate, null, viewCount, likeCount, '👎 싫어요'), 
            round:false, clickable:false, createdAt: pubDate
          });
        }); });
      cache.disliked = items;
      saveSessionCache();
      endLoad();
      onDataReady();
    }catch(err){ handleLoadError(err); }
  }

  async function fetchPlaylists(){
    beginLoad();
    const items = [];
    try{
      await apiPaginate('https://www.googleapis.com/youtube/v3/playlists',
        { part:'snippet,contentDetails', mine:'true', maxResults:'50' },
        (batch)=>{ batch.forEach(pl=>{
          items.push({
            id: pl.id,
            title: pl.snippet.title,
            sub: (pl.contentDetails.itemCount || 0).toLocaleString() + '개 영상',
            thumb: (pl.snippet.thumbnails && (pl.snippet.thumbnails.medium || pl.snippet.thumbnails.default) || {}).url || '',
            badge: fmtDates(pl.snippet.publishedAt, null, null, null, '재생목록'), round:false, clickable:true
          });
        }); });
      cache.playlists = items;
      saveSessionCache();
      endLoad();
      onDataReady();
    }catch(err){ handleLoadError(err); }
  }

  async function fetchVideosDetails(videoIds) {
    if(!videoIds || videoIds.length === 0) return {};
    const detailsMap = {};
    const chunks = [];
    for(let i=0; i<videoIds.length; i+=50) {
      chunks.push(videoIds.slice(i, i+50));
    }
    for(const chunk of chunks) {
      const url = new URL('https://www.googleapis.com/youtube/v3/videos');
      url.searchParams.set('part', 'contentDetails,statistics');
      url.searchParams.set('id', chunk.join(','));
      const res = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } });
      if(res.ok) {
        const data = await res.json();
        (data.items || []).forEach(v => {
          detailsMap[v.id] = {
            duration: parseDuration(v.contentDetails ? v.contentDetails.duration : ''),
            durationSec: parseDurationToSec(v.contentDetails ? v.contentDetails.duration : ''),
            viewCount: v.statistics ? v.statistics.viewCount : null,
            likeCount: v.statistics ? v.statistics.likeCount : null
          };
        });
      }
    }
    return detailsMap;
  }

  async function fetchPlaylistItems(playlist){
    beginLoad();
    const rawItems = [];
    const videoIds = [];
    try{
      await apiPaginate('https://www.googleapis.com/youtube/v3/playlistItems',
        { part:'snippet', playlistId: playlist.id, maxResults:'50' },
        (batch)=>{ batch.forEach(item=>{
          const vid = item.snippet.resourceId ? item.snippet.resourceId.videoId : '';
          if(vid) videoIds.push(vid);
          rawItems.push(item);
        }); });
      
      const detailsMap = await fetchVideosDetails(videoIds);
      const items = rawItems.map(item => {
        const vid = item.snippet.resourceId ? item.snippet.resourceId.videoId : '';
        const addedAt = item.snippet.publishedAt || '';
        const videoOwnerPublishedAt = item.snippet.videoOwnerPublishedAt || '';
        const det = detailsMap[vid] || {};
        return {
          title: item.snippet.title,
          sub: item.snippet.videoOwnerChannelTitle || item.snippet.channelTitle || '',
          thumb: (item.snippet.thumbnails && (item.snippet.thumbnails.medium || item.snippet.thumbnails.default) || {}).url || '',
          url: vid ? 'https://www.youtube.com/watch?v=' + vid : '',
          videoId: vid,
          duration: det.duration || '',
          durationSec: det.durationSec || 0,
          badge: fmtDates(videoOwnerPublishedAt, addedAt, det.viewCount, det.likeCount, '생성일 미상'), 
          round:false, clickable:false, addedAt, createdAt: videoOwnerPublishedAt
        };
      });

      playlistItemsCache[playlist.id] = items;
      saveSessionCache();
      endLoad();
      onDataReady();
    }catch(err){ handleLoadError(err); }
  }

  async function fetchSubscriptions(){
    beginLoad();
    const items = [];
    try{
      await apiPaginate('https://www.googleapis.com/youtube/v3/subscriptions',
        { part:'snippet', mine:'true', maxResults:'50', order:'alphabetical' },
        (batch)=>{ batch.forEach(sub=>{
          const chId = sub.snippet.resourceId ? sub.snippet.resourceId.channelId : '';
          items.push({
            channelId: chId,
            title: sub.snippet.title,
            sub: sub.snippet.description ? sub.snippet.description.slice(0,120) : '',
            thumb: (sub.snippet.thumbnails && (sub.snippet.thumbnails.medium || sub.snippet.thumbnails.default) || {}).url || '',
            url: chId ? 'https://www.youtube.com/channel/' + chId : '',
            badge: fmtDates(sub.snippet.publishedAt, null, null, null, '구독'), round:true, clickable:false, isDesc:true
          });
        }); });
      cache.subscriptions = items;
      saveSessionCache();
      endLoad();
      onDataReady();
    }catch(err){ handleLoadError(err); }
  }

  async function fetchTrending(regionCode = 'KR'){
    beginLoad();
    const items = [];
    try{
      await apiPaginate('https://www.googleapis.com/youtube/v3/videos',
        { part:'snippet,contentDetails,statistics', chart:'mostPopular', regionCode, maxResults:'50' },
        (batch)=>{ batch.forEach(item=>{
          const pubDate = item.snippet.publishedAt || '';
          const duration = parseDuration(item.contentDetails ? item.contentDetails.duration : '');
          const durationSec = parseDurationToSec(item.contentDetails ? item.contentDetails.duration : '');
          const viewCount = item.statistics ? item.statistics.viewCount : null;
          const likeCount = item.statistics ? item.statistics.likeCount : null;

          items.push({
            title: item.snippet.title,
            sub: item.snippet.channelTitle,
            thumb: (item.snippet.thumbnails && (item.snippet.thumbnails.medium || item.snippet.thumbnails.default) || {}).url || '',
            url: 'https://www.youtube.com/watch?v=' + item.id,
            videoId: item.id,
            duration, durationSec,
            badge: fmtDates(pubDate, null, viewCount, likeCount, '🔥 인기'), 
            round:false, clickable:false, createdAt: pubDate
          });
        }); }, 1);
      cache.trending[regionCode] = items;
      saveSessionCache();
      endLoad();
      onDataReady();
    }catch(err){ handleLoadError(err); }
  }

  async function fetchGeneralSearch(query){
    if(!query) return;
    beginLoad();
    const rawItems = [];
    const videoIds = [];
    try{
      await apiPaginate('https://www.googleapis.com/youtube/v3/search',
        { part:'snippet', q: query, maxResults:'50' },
        (batch)=>{ batch.forEach(item=>{
          if(item.id && item.id.videoId) videoIds.push(item.id.videoId);
          rawItems.push(item);
        }); }, 2);

      const detailsMap = await fetchVideosDetails(videoIds);
      const items = rawItems.map(item => {
        const vid = item.id ? item.id.videoId : '';
        const chId = item.id ? item.id.channelId : '';
        const plId = item.id ? item.id.playlistId : '';
        const pubDate = item.snippet.publishedAt || '';
        const det = detailsMap[vid] || {};

        let url = '';
        let badge = '검색';
        let round = false;
        if(vid) { url = 'https://www.youtube.com/watch?v=' + vid; badge = fmtDates(pubDate, null, det.viewCount, det.likeCount, '동영상'); }
        else if(chId) { url = 'https://www.youtube.com/channel/' + chId; badge = '채널'; round = true; }
        else if(plId) { url = 'https://www.youtube.com/playlist?list=' + plId; badge = '재생목록'; }

        return {
          title: item.snippet.title,
          sub: item.snippet.channelTitle || item.snippet.description || '',
          thumb: (item.snippet.thumbnails && (item.snippet.thumbnails.medium || item.snippet.thumbnails.default) || {}).url || '',
          url, videoId: vid,
          duration: det.duration || '',
          durationSec: det.durationSec || 0,
          badge, round, clickable: false, createdAt: pubDate
        };
      });

      cache.search = items;
      saveSessionCache();
      endLoad();
      onDataReady();
    }catch(err){ handleLoadError(err); }
  }

  function activeDataset(){
    if(mode === 'all') return cache.all || [];
    if(mode === 'liked') return cache.liked || [];
    if(mode === 'disliked') return cache.disliked || [];
    if(mode === 'playlists') return cache.playlists || [];
    if(mode === 'subscriptions') return cache.subscriptions || [];
    if(mode === 'trending') return cache.trending[regionSelect.value || 'KR'] || [];
    if(mode === 'search') return cache.search || [];
    if(mode === 'playlistItems' && currentPlaylist) return playlistItemsCache[currentPlaylist.id] || [];
    return [];
  }

  function onDataReady(){
    const data = activeDataset();
    filtered = data;
    applyFilters();
    visibleCount = 20;

    if (dataSourceBadge) {
      if (lastDataSource === 'network') {
        dataSourceBadge.textContent = '🌐 API에서 새로 받아옴 (세션 저장)';
        dataSourceBadge.title = '방금 YouTube API에서 새로 가져온 데이터입니다. sessionStorage에 임시 저장되어 새로고침해도 유지되지만, 탭/브라우저를 닫으면 사라집니다.';
        dataSourceBadge.className = 'source-badge source-network';
      } else if (lastDataSource === 'session') {
        dataSourceBadge.textContent = '🧠 세션 캐시 (sessionStorage)';
        dataSourceBadge.title = '이번 탭에서 이미 불러온 데이터를 재사용 중입니다 (네트워크 호출 없음). 탭/브라우저를 닫으면 사라집니다.';
        dataSourceBadge.className = 'source-badge source-cache';
      } else if (lastDataSource === 'saved') {
        dataSourceBadge.textContent = '📦 저장된 데이터 (IndexedDB)';
        dataSourceBadge.title = '이전에 "현재 데이터 저장" 버튼으로 브라우저에 영구 저장해 둔 데이터입니다. 로그인 없이도 볼 수 있습니다.';
        dataSourceBadge.className = 'source-badge source-saved';
      } else {
        dataSourceBadge.textContent = '';
        dataSourceBadge.className = 'source-badge';
      }
    }

    stats.innerHTML = '';
    channelQueryInput.style.display = 'none';
    regionSelect.style.display = 'none';

    if(mode === 'all'){
      stats.style.display = 'none';
      searchInput.placeholder = '전체 영상 검색...';
    }else if(mode === 'liked' || mode === 'disliked'){
      stats.style.display = 'none';
      searchInput.placeholder = '제목으로 검색...';
    }else if(mode === 'playlists'){
      stats.innerHTML = statBlock(data.length,'재생목록 개수');
      stats.style.display = 'grid';
      searchInput.placeholder = '재생목록 이름으로 검색...';
    }else if(mode === 'subscriptions'){
      stats.innerHTML = statBlock(data.length,'구독 채널 수');
      stats.style.display = 'grid';
      searchInput.placeholder = '채널 이름 검색...';
      channelQueryInput.style.display = 'block';
    }else if(mode === 'trending'){
      const channels = new Set(data.map(v=>v.sub));
      stats.innerHTML = statBlock(data.length,'인기 영상') + statBlock(channels.size,'채널 수');
      stats.style.display = 'grid';
      searchInput.placeholder = '인기 영상 검색...';
      regionSelect.style.display = 'block';
    }else if(mode === 'search'){
      stats.innerHTML = statBlock(data.length,'검색 결과');
      stats.style.display = 'grid';
      searchInput.placeholder = '유튜브 전체 검색어 입력 후 Enter...';
    }else if(mode === 'playlistItems'){
      const channels = new Set(data.map(v=>v.sub));
      stats.innerHTML = statBlock(data.length,'영상 수') + statBlock(channels.size,'채널 수');
      stats.style.display = 'grid';
      searchInput.placeholder = '제목으로 검색...';
    }else{
      stats.style.display = 'none';
      searchInput.placeholder = '제목으로 검색...';
    }

    if(mode === 'liked' || mode === 'disliked' || mode === 'trending' || mode === 'search' || mode === 'playlistItems'){
      sortSelect.innerHTML = `
        <option value="original">기본 순서</option>
        <option value="title">이름순</option>
        <option value="dateDesc">날짜 최신순</option>
        <option value="dateAsc">날짜 오래된순</option>
        <option value="durationDesc">영상 긴순</option>
        <option value="durationAsc">영상 짧은순</option>
      `;
    }else{
      sortSelect.innerHTML = `
        <option value="original">기본 순서</option>
        <option value="title">이름순</option>
      `;
    }

    metaLeft.innerHTML = '';
    if(mode === 'playlistItems' && currentPlaylist){
      const backBtn = document.createElement('button');
      backBtn.textContent = '◀ 재생목록으로';
      backBtn.style.marginRight = '10px';
      backBtn.addEventListener('click', ()=>{ history.back(); });
      metaLeft.appendChild(backBtn);
      const label = document.createElement('span');
      label.textContent = currentPlaylist.title + '  ·  ';
      label.style.marginRight = '6px';
      metaLeft.appendChild(label);
    }
    metaLeft.appendChild(resultCount);

    controls.style.display = 'flex';
    metaRow.style.display = 'flex';

    render();
  }

  function statBlock(n,label){
    return `<div class="stat"><b>${(n||0).toLocaleString()}</b><span>${escapeHtml(label)}</span></div>`;
  }

  function populateChannelSelect(data){
    const counts = {};
    data.forEach(v=>{ if(v.sub) counts[v.sub] = (counts[v.sub]||0)+1; });
    const top = Object.keys(counts).sort((a,b)=>counts[b]-counts[a]).slice(0,300);
    channelSelect.innerHTML = '<option value="">전체 채널</option>' +
      top.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)} (${counts[c]})</option>`).join('');
  }

  function applyFilters(){
    const data = activeDataset();
    const q = searchInput.value.trim().toLowerCase();
    const ch = (channelSelect && (mode==='liked'||mode==='disliked'||mode==='trending'||mode==='playlistItems')) ? channelSelect.value : '';
    filtered = data.filter(v=>{
      if(ch && v.sub !== ch) return false;
      if(q && !v.title.toLowerCase().includes(q)) return false;
      return true;
    });
    if(sortSelect.value === 'title'){
      filtered = filtered.slice().sort((a,b)=>a.title.localeCompare(b.title, 'ko'));
    }else if(sortSelect.value === 'dateDesc'){
      filtered = filtered.slice().sort((a,b)=> new Date(b.addedAt||b.createdAt||0) - new Date(a.addedAt||a.createdAt||0));
    }else if(sortSelect.value === 'dateAsc'){
      filtered = filtered.slice().sort((a,b)=> new Date(a.addedAt||b.createdAt||0) - new Date(b.addedAt||b.createdAt||0));
    }else if(sortSelect.value === 'durationDesc'){
      filtered = filtered.slice().sort((a,b)=> (b.durationSec||0) - (a.durationSec||0));
    }else if(sortSelect.value === 'durationAsc'){
      filtered = filtered.slice().sort((a,b)=> (a.durationSec||0) - (b.durationSec||0));
    }
    page = 1;
    resultCount.textContent = q
      ? filtered.length.toLocaleString() + '/' + data.length.toLocaleString() + '건 결과'
      : filtered.length.toLocaleString() + '건 결과';

    render();
  }

  function render(){
    const navMode = navModeSelect ? navModeSelect.value : 'scroll';
    const isMobile = window.innerWidth <= 600;

    let itemsToRender = [];
    if (navMode === 'pagination') {
      const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
      if(page > totalPages) page = totalPages;
      const start = (page-1) * PAGE_SIZE;
      itemsToRender = filtered.slice(start, start + PAGE_SIZE);
      renderPager(totalPages);
      pager.style.display = 'flex';
      pagerTop.style.display = 'flex';
    } else {
      itemsToRender = filtered.slice(0, visibleCount);
      pager.style.display = 'none';
      pagerTop.style.display = 'none';
    }

    if(itemsToRender.length === 0){
      listEl.innerHTML = '';
      emptyHint.textContent = '검색 조건에 맞는 항목이 없어요.';
      emptyHint.style.display = 'block';
      pager.style.display = 'none';
      pagerTop.style.display = 'none';
      return;
    }
    emptyHint.style.display = 'none';

    // Calculate item start index for numbering (only for pagination)
    const startIndex = (navMode === 'pagination') ? (page-1) * PAGE_SIZE : 0;

    listEl.innerHTML = itemsToRender.map((v, idx)=>{
      const displayIdx = startIndex + idx + 1; // Numbering
      const durationBadge = v.duration ? `<span class="duration-tag">${escapeHtml(v.duration)}</span>` : '';
      const thumbHtml = v.thumb ? `
        <div class="thumb-wrap" data-idx="${idx}" data-vid="${escapeHtml(v.videoId)}">
          <img class="thumb${v.round?' round':''}" src="${escapeHtml(v.thumb)}" alt="" loading="lazy">
          ${durationBadge}
          <div class="inline-player" data-player-idx="${idx}"></div>
        </div>
      ` : '';
      
      const titleHtml = v.url
        ? `<a href="${escapeHtml(v.url)}" target="_blank" rel="noopener">${displayIdx}. ${escapeHtml(v.title)}</a>`
        : `${displayIdx}. ${escapeHtml(v.title)}`;
      const subHtml = v.isDesc
        ? `<div class="stub-desc">${escapeHtml(v.sub)}</div>`
        : `<div class="stub-sub">${
            v.channelId 
            ? `<a class="ch-link" href="https://www.youtube.com/channel/${escapeHtml(v.channelId)}" target="_blank" rel="noopener">${escapeHtml(v.sub)}</a>`
            : escapeHtml(v.sub)
          }</div>`;
      
      let playRowHtml = '';
      playRowHtml = (mode === 'subscriptions' && v.channelId) ? `
        <div class="play-row">
          <button class="search-channel-external-btn" data-chid="${escapeHtml(v.channelId)}" data-idx="${idx}">🔍 채널내 동영상 검색</button>
        </div>
      ` : '';

      return `
        <div class="stub ${v.clickable?'clickable':''}" data-idx="${idx}">
          <div class="thumb-wrap" data-idx="${idx}" data-vid="${escapeHtml(v.videoId)}">
            <img class="thumb${v.round?' round':''}" src="${escapeHtml(v.thumb)}" alt="" loading="lazy">
            ${durationBadge}
            <div class="inline-player" data-player-idx="${idx}"></div>
          </div>
          <div class="stub-main">
            <p class="stub-title">${titleHtml}</p>
            ${subHtml}
            ${playRowHtml}
            <div class="stamp-badge">${v.accountName ? `<span class="acct-tag">👤 ${escapeHtml(v.accountName)}</span> ` : ''}${escapeHtml(v.badge)}</div>
          </div>
        </div>
      `;
    }).join('');

    // Thumbnail Click for Inline Play
    listEl.querySelectorAll('.thumb-wrap').forEach(el => {
        el.addEventListener('click', (e) => {
            const idx = el.dataset.idx;
            const vid = el.dataset.vid;
            if (!vid) return;
            const playerEl = listEl.querySelector(`.inline-player[data-player-idx="${idx}"]`);
            
            // Close other players
            listEl.querySelectorAll('.inline-player.open').forEach(p=>{ p.classList.remove('open'); p.innerHTML=''; });
            
            playerEl.innerHTML = `<iframe src="https://www.youtube.com/embed/${encodeURIComponent(vid)}?autoplay=1" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
            playerEl.classList.add('open');
        });
    });

    // Button Listeners
    if(mode === 'playlists'){
      listEl.querySelectorAll('.stub.clickable').forEach((el, idx)=>{
        el.addEventListener('click', (e)=>{
          if(e.target.closest('.play-row')) return;
          const pl = itemsToRender[idx];
          const originalPlaylist = (cache.playlists || []).find(p=>p.id === pl.id) || pl;
          currentPlaylist = originalPlaylist;
          mode = 'playlistItems';
          pushNavState('playlistItems', currentPlaylist, null);
          if(playlistItemsCache[currentPlaylist.id]){
            lastDataSource = 'session';
            onDataReady();
          }else{
            fetchPlaylistItems(currentPlaylist);
          }
        });
      });
    }

    if(mode === 'subscriptions'){
      listEl.querySelectorAll('.search-channel-external-btn').forEach((btn, idx)=>{
        btn.addEventListener('click', ()=>{
          const ch = itemsToRender[idx];
          const query = channelQueryInput.value.trim();

          let targetUrl = 'https://www.youtube.com/channel/' + ch.channelId;
          if(query){
            targetUrl += '/search?query=' + encodeURIComponent(query);
          }
          window.open(targetUrl, '_blank');
        });
      });
    }
  }

  function renderPager(totalPages){
    renderPagerTo(pager, totalPages);
    renderPagerTo(pagerTop, totalPages);
  }
  
  function renderPagerTo(container, totalPages) {
    if(totalPages <= 1){ container.style.display = 'none'; container.innerHTML=''; return; }
    container.style.display = 'flex';
    const nums = pageNumberList(totalPages, page);
    let html = `<button data-pg="prev" ${page<=1?'disabled':''}>◀</button>`;
    nums.forEach(n=>{
      if(n === '...'){
        html += `<span class="dots">…</span>`;
      }else{
        html += `<button data-pg="${n}" class="${n===page?'current':''}">${n}</button>`;
      }
    });
    html += `<button data-pg="next" ${page>=totalPages?'disabled':''}>▶</button>`;
    container.innerHTML = html;
  }

  function pageNumberList(total, current){
    const delta = 2;
    const range = [];
    for(let i=1;i<=total;i++){
      if(i===1 || i===total || (i>=current-delta && i<=current+delta)) range.push(i);
    }
    const withDots = [];
    let last = 0;
    for(const i of range){
      if(last){
        if(i - last === 2) withDots.push(last+1);
        else if(i - last > 2) withDots.push('...');
      }
      withDots.push(i);
      last = i;
    }
    return withDots;
  }

  pager.addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-pg]');
    if(!btn || btn.disabled) return;
    const pg = btn.dataset.pg;
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if(pg === 'prev') page = Math.max(1, page-1);
    else if(pg === 'next') page = Math.min(totalPages, page+1);
    else page = parseInt(pg, 10);
    render();
    window.scrollTo({top:0,behavior:'smooth'});
  });
  
  pagerTop.addEventListener('click', (e) => { pager.dispatchEvent(new Event('click', { bubbles: true, cancelable: true })); });

  let searchTimer;
  function safeAddListener(id, event, callback) {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener(event, callback);
    }
  }

  searchInput.addEventListener('input', ()=>{ 
    if(mode === 'search') return; 
    clearTimeout(searchTimer); 
    searchTimer = setTimeout(applyFilters, 150); 
  });

  searchInput.addEventListener('keypress', (e)=>{
    if(e.key === 'Enter' && mode === 'search') {
      fetchGeneralSearch(searchInput.value.trim());
    }
  });

  if(regionSelect) regionSelect.addEventListener('change', ()=>{
    fetchTrending(regionSelect.value);
  });

  if(channelSelect) channelSelect.addEventListener('change', applyFilters);
  if(sortSelect) sortSelect.addEventListener('change', applyFilters);
  if(navModeSelect) navModeSelect.addEventListener('change', render);
  
  safeAddListener('themeToggle', 'click', async () => {
    document.documentElement.classList.toggle('light');
    await dbSet('theme', document.documentElement.classList.contains('light') ? 'light' : 'dark');
  });

  document.getElementById('saveDataBtn').addEventListener('click', () => {
    const dataStr = JSON.stringify(cache, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yt_data_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Set build timestamp
  const timestamp = '260829-231500';
  const buildTimeEl = document.getElementById('buildTime');
  if (buildTimeEl) buildTimeEl.textContent = timestamp;
})();