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
  const refreshBtn = document.getElementById('refreshBtn');
  const resultCount = document.getElementById('resultCount');
  const totalVideoCount = document.getElementById('totalVideoCount');
  const resetBtn = document.getElementById('resetBtn');

  const DB_NAME = 'MyTubeDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'cacheStore';

  let currentAccountId = 'default';
  
  async function getAccountList() {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get('global_account_list');
      req.onsuccess = () => resolve(req.result || ['default']);
    });
  }
  
  async function addAccount(accountId) {
    let list = await getAccountList();
    if (!list.includes(accountId)) {
        list.push(accountId);
        const db = await getDB();
        return new Promise((resolve) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          store.put(list, 'global_account_list');
          tx.oncomplete = () => {
            updateAccountSelect(list);
            resolve();
          };
        });
    }
  }

  function updateAccountSelect(list) {
    const select = document.getElementById('accountSelect');
    const container = document.getElementById('accountContainer');
    
    // Check for actual accounts (not 'default')
    const actualAccounts = list.filter(id => id !== 'default');
    
    if (actualAccounts.length > 0) {
        select.innerHTML = actualAccounts.map(id => 
            `<option value="${id}">${id}</option>`
        ).join('');
        
        // Ensure current account is valid
        if (actualAccounts.includes(currentAccountId)) {
            select.value = currentAccountId;
        } else {
            select.value = actualAccounts[0];
            currentAccountId = actualAccounts[0];
        }
        container.style.display = 'block';
    } else {
        container.style.display = 'none';
        currentAccountId = 'default';
    }
  }

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

  let tokenClient = null;
  let accessToken = sessionStorage.getItem('yt_access_token') || null;
  let cache = { liked: null, disliked: null, playlists: null, subscriptions: null, trending: {}, search: null, all: null };
  let playlistItemsCache = {};
  let channelSearchCache = {};
  let currentPlaylist = null;
  let currentSearchChannel = null;
  let filtered = [];
  let page = 1;
  let visibleCount = 20;
  const PAGE_SIZE = 30;
  let observer;

  function showError(msg){ errMsg.style.display='block'; errMsg.textContent = msg; }
  function clearError(){ errMsg.style.display='none'; errMsg.textContent=''; }
  function setStatus(msg){ statusLine.style.display = msg ? 'block' : 'none'; statusLine.textContent = msg; }
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

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
      currentSearchChannel = e.state.channel;
      setActiveTab(mode === 'playlistItems' ? 'playlists' : (mode === 'channelSearch' ? 'subscriptions' : mode));
      onDataReady();
    }else{
      loadTab('liked', false);
    }
  });

  window.addEventListener('DOMContentLoaded', async ()=>{
    const theme = await dbGet('theme');
    if (theme === 'light') {
      document.documentElement.classList.add('light');
    }
    
    // Init account list
    const accounts = await getAccountList();
    updateAccountSelect(accounts);

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
    
    if(accessToken){
      await loadAccountData();
    }
  });

  async function loadAccountData() {
    cache = await dbGet('yt_cache') || { liked: null, disliked: null, playlists: null, subscriptions: null, trending: {}, search: null, all: null };
    playlistItemsCache = await dbGet('yt_playlistItemsCache') || {};

    loginBtn.style.display = 'none';
    logoutBtn.style.display = 'inline-block';
    tabbar.style.display = 'flex';
    
    if (cache.all) {
      mode = 'all';
      onDataReady();
    } else {
      loadTab('all', false);
    }
    history.replaceState({ mode: 'all', playlist: null, channel: null }, '');
  }

  function initTokenClient(){
    const clientId = clientIdInput.value.trim();
    return google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.force-ssl https://www.googleapis.com/auth/userinfo.email',
      callback: (resp)=>{
        if(resp.error){ handleAuthError(resp); return; }
        accessToken = resp.access_token;
        sessionStorage.setItem('yt_access_token', accessToken);
        
        fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: 'Bearer ' + accessToken }
        })
        .then(res => res.json())
        .then(userInfo => {
            console.log('--- [STAGE 1: Account Selection] ---');
            console.log('Detected Account:', userInfo.email);
            
            // Check if it's a primary account
            if (userInfo.email && !userInfo.email.endsWith('@pages.plusgoogle.com')) {
                sessionStorage.setItem('yt_primary_email', userInfo.email);
                console.log('Primary email saved:', userInfo.email);
            }
            
            const primaryEmail = sessionStorage.getItem('yt_primary_email') || userInfo.email || 'unknown_email';
            
            fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
                headers: { Authorization: 'Bearer ' + accessToken }
            })
            .then(res => res.json())
            .then(data => {
                console.log('--- [STAGE 2: Brand Account Details] ---');
                console.log('Channel Data:', data);
                
                if (data.items && data.items.length > 0) {
                    const channelId = data.items[0].id;
                    const newAccountId = channelId;
                    console.log('Final Account ID generated:', newAccountId);
                    
                    currentAccountId = newAccountId;
                    addAccount(newAccountId);
                    loadAccountData();
                }
            });
        });
        
        loginBtn.style.display = 'none';
        logoutBtn.style.display = 'inline-block';
        clearError();
        tabbar.style.display = 'flex';
        loadTab('liked', false);
        history.replaceState({ mode: 'liked', playlist: null, channel: null }, '');
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
    accessToken = null;
    sessionStorage.removeItem('yt_access_token');

    // UI updates to reflect logged-out state
    loginBtn.style.display = 'inline-block';
    logoutBtn.style.display = 'none';

    // Ensure tabbar remains visible
    tabbar.style.display = 'flex';

    // Refresh the UI to reflect new auth state, while keeping data
    onDataReady();
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
      currentSearchChannel = null;
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
    if(tab === 'all'){
      if(!cache.all){ await fetchAll(); } else { onDataReady(); }
    }else if(tab === 'liked'){
      if(!cache.liked){ await fetchLiked(); } else { onDataReady(); }
    }else if(tab === 'disliked'){
      if(!cache.disliked){ await fetchDisliked(); } else { onDataReady(); }
    }else if(tab === 'playlists'){
      if(!cache.playlists){ await fetchPlaylists(); } else { onDataReady(); }
    }else if(tab === 'subscriptions'){
      if(!cache.subscriptions){ await fetchSubscriptions(); } else { onDataReady(); }
    }else if(tab === 'trending'){
      const region = regionSelect.value || 'KR';
      if(!cache.trending[region]){ await fetchTrending(region); } else { onDataReady(); }
    }else if(tab === 'search'){
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
      sessionStorage.removeItem('yt_access_token');
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
      await dbSet('yt_cache', cache);
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
      
      // 2. Fetch All Playlists and their Items
      const playlistIds = [];
      await apiPaginate('https://www.googleapis.com/youtube/v3/playlists',
        { part:'snippet', mine:'true', maxResults:'50' },
        (batch)=>{ batch.forEach(pl=>{
          playlistIds.push({id: pl.id, title: pl.snippet.title});
        }); });

      for(const pl of playlistIds){
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
            badge: '출처: ' + pl.title + ' · ' + fmtDates(item.snippet.videoOwnerPublishedAt || '', item.snippet.publishedAt || '', det.viewCount, det.likeCount, ''),
            source: '재생목록: ' + pl.title,
            createdAt: item.snippet.publishedAt
          };
        });
        playlistItemsCache[pl.id] = plItems;
        items.push(...plItems);
      }

      cache.all = items;
      await dbSet('yt_cache', cache);
      await dbSet('yt_playlistItemsCache', playlistItemsCache);
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
      await dbSet('yt_cache', cache);
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
      await dbSet('yt_cache', cache);
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
      await dbSet('yt_playlistItemsCache', playlistItemsCache);
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
      await dbSet('yt_cache', cache);
      endLoad();
      onDataReady();
    }catch(err){ handleLoadError(err); }
  }

  async function fetchChannelVideos(channel){
    beginLoad();
    const rawItems = [];
    const videoIds = [];
    try{
      await apiPaginate('https://www.googleapis.com/youtube/v3/search',
        { part:'snippet', channelId: channel.channelId, type:'video', order:'date', maxResults:'50' },
        (batch)=>{ batch.forEach(item=>{
          const vid = item.id ? item.id.videoId : '';
          if(vid) videoIds.push(vid);
          rawItems.push(item);
        }); }, 5);

      const detailsMap = await fetchVideosDetails(videoIds);
      const items = rawItems.map(item => {
        const vid = item.id ? item.id.videoId : '';
        const publishedAt = item.snippet.publishedAt || '';
        const det = detailsMap[vid] || {};
        return {
          title: item.snippet.title,
          sub: item.snippet.channelTitle || channel.title,
          thumb: (item.snippet.thumbnails && (item.snippet.thumbnails.medium || item.snippet.thumbnails.default) || {}).url || '',
          url: vid ? 'https://www.youtube.com/watch?v=' + vid : '',
          videoId: vid,
          duration: det.duration || '',
          durationSec: det.durationSec || 0,
          badge: fmtDates(publishedAt, null, det.viewCount, det.likeCount, '생성일 미상'), 
          round:false, clickable:false, createdAt: publishedAt
        };
      });

      channelSearchCache[channel.channelId] = items;
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
      await dbSet('yt_cache', cache);
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
      await dbSet('yt_cache', cache);
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
    if(mode === 'channelSearch' && currentSearchChannel) return channelSearchCache[currentSearchChannel.channelId] || [];
    return [];
  }

  function onDataReady(){
    const data = activeDataset();
    filtered = data;
    applyFilters();
    visibleCount = 20;

    stats.innerHTML = '';
    channelQueryInput.style.display = 'none';
    regionSelect.style.display = 'none';

    if(mode === 'all'){
      stats.innerHTML = statBlock(filtered.length, '전체 영상 수');
      stats.style.display = 'grid';
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
    }else if(mode === 'channelSearch'){
      stats.innerHTML = statBlock(data.length,'불러온 영상');
      stats.style.display = 'grid';
      searchInput.placeholder = '채널 내 영상 제목 검색...';
    }else{
      stats.style.display = 'none';
      searchInput.placeholder = '제목으로 검색...';
    }

    if(mode === 'liked' || mode === 'disliked' || mode === 'trending' || mode === 'search' || mode === 'playlistItems' || mode === 'channelSearch'){
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
    }else if(mode === 'channelSearch' && currentSearchChannel){
      const backBtn = document.createElement('button');
      backBtn.textContent = '◀ 구독 목록으로';
      backBtn.style.marginRight = '10px';
      backBtn.addEventListener('click', ()=>{ history.back(); });
      metaLeft.appendChild(backBtn);
      const label = document.createElement('span');
      label.textContent = '[' + currentSearchChannel.title + '] 채널 동영상  ·  ';
      label.style.marginRight = '6px';
      metaLeft.appendChild(label);
    }
    metaLeft.appendChild(resultCount);

    controls.style.display = 'flex';
    metaRow.style.display = 'flex';
    
    // Refresh button visibility and handler
    const refreshBtn = document.getElementById('refreshBtn');
    if(refreshBtn) {
      refreshBtn.style.display = (mode === 'all') ? 'inline-block' : 'none';
      refreshBtn.onclick = () => { onDataReady(); };
    }
    
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
    resultCount.textContent = filtered.length.toLocaleString() + '건 결과';
    
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
          <button class="search-channel-btn" data-chid="${escapeHtml(v.channelId)}" data-idx="${idx}">▶ 앱 내에서 검색</button>
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
            <div class="stamp-badge">${escapeHtml(v.badge)}</div>
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

      listEl.querySelectorAll('.search-channel-btn').forEach((btn, idx)=>{
        btn.addEventListener('click', ()=>{
          const ch = itemsToRender[idx];
          currentSearchChannel = ch;
          mode = 'channelSearch';
          pushNavState('channelSearch', null, currentSearchChannel);
          if(channelSearchCache[ch.channelId]){
            onDataReady();
          }else{
            fetchChannelVideos(ch);
          }
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

  document.getElementById('accountSelect').addEventListener('change', async () => {
    currentAccountId = document.getElementById('accountSelect').value;
    loadAccountData();
  });

  // Set build timestamp
  const timestamp = '260829-220000';
  const buildTimeEl = document.getElementById('buildTime');
  if (buildTimeEl) buildTimeEl.textContent = timestamp;
})();