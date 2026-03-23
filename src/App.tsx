/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';

export default function App() {
  const [view, setView] = useState('login'); // 'login', 'guilds', 'dash'
  const [user, setUser] = useState<any>(null);
  const [guilds, setGuilds] = useState<any[]>([]);
  const [loadingGuilds, setLoadingGuilds] = useState(true);
  
  const [currentGuild, setCurrentGuild] = useState<any>(null);
  const [guildData, setGuildData] = useState<any>(null);
  const [loadingGuildData, setLoadingGuildData] = useState(false);
  
  const [activeTab, setActiveTab] = useState('welcome');
  const [toast, setToast] = useState<{msg: string, type: string} | null>(null);

  // Settings State
  const [welcomeEnabled, setWelcomeEnabled] = useState(false);
  const [welcomeChannel, setWelcomeChannel] = useState('');
  const [welcomeMsg, setWelcomeMsg] = useState('');
  
  const [autoRoleEnabled, setAutoRoleEnabled] = useState(false);
  const [autoRoleSelect, setAutoRoleSelect] = useState('');

  const [logChannel, setLogChannel] = useState('');
  const [ticketChannel, setTicketChannel] = useState('');

  const [protection, setProtection] = useState({ antiSpam: false, antiLink: false, antiMention: false });

  useEffect(() => {
    checkAuth();

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        checkAuth();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/me');
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        setView('guilds');
        loadGuilds();
      } else {
        setView('login');
      }
    } catch {
      setView('login');
    }
  };

  const loadGuilds = async () => {
    setLoadingGuilds(true);
    try {
      const res = await fetch('/api/guilds');
      if (res.ok) {
        const data = await res.json();
        setGuilds(data);
      }
    } catch (e) {
      console.error(e);
    }
    setLoadingGuilds(false);
  };

  const handleLogin = async () => {
    // Tarayıcıların popup engelleyicisine takılmamak için pencereyi hemen açıyoruz
    const authWindow = window.open('', 'oauth_popup', 'width=600,height=700');
    
    try {
      const redirectUri = `${window.location.origin}/auth/callback`;
      const res = await fetch(`/api/auth/url?redirectUri=${encodeURIComponent(redirectUri)}`);
      const data = await res.json();
      
      if (data.url && authWindow) {
        authWindow.location.href = data.url;
      } else {
        if (authWindow) authWindow.close();
        if (data.error) {
          showToast(data.error, 'error');
        }
      }
    } catch (e) {
      if (authWindow) authWindow.close();
      showToast('Discord bağlantısı başlatılamadı', 'error');
    }
  };

  const handleLogout = () => {
    window.location.href = '/auth/logout';
  };

  const openGuild = async (guildId: string) => {
    setView('dash');
    setLoadingGuildData(true);
    setCurrentGuild(guildId);
    
    try {
      const res = await fetch(`/api/guild/${guildId}`);
      if (!res.ok) {
        showToast('Sunucu yüklenemedi', 'error');
        setView('guilds');
        return;
      }
      const data = await res.json();
      setGuildData(data);
      
      // Initialize settings state
      const s = data.settings;
      setWelcomeEnabled(s.welcomeMsg?.enabled || false);
      setWelcomeChannel(s.welcomeMsg?.channelId || '');
      setWelcomeMsg(s.welcomeMsg?.message || '');
      
      setAutoRoleEnabled(!!s.autoRole);
      setAutoRoleSelect(s.autoRole || '');
      
      setLogChannel(s.logChannel || '');
      setTicketChannel(s.ticketChannel || '');
      
      setProtection(s.protection || { antiSpam: false, antiLink: false, antiMention: false });
      
      setActiveTab('welcome');
    } catch (e) {
      showToast('Sunucu yüklenirken hata oluştu', 'error');
      setView('guilds');
    }
    setLoadingGuildData(false);
  };

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const apiPost = async (type: string, value: any) => {
    const res = await fetch(`/api/guild/${currentGuild}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, value })
    });
    return res.json();
  };

  const saveWelcome = async () => {
    const r = await apiPost('welcomeMsg', { enabled: welcomeEnabled, channelId: welcomeChannel, message: welcomeMsg });
    r.success ? showToast('✅ Hoş geldin mesajı kaydedildi!') : showToast('Hata oluştu', 'error');
  };

  const saveAutoRole = async () => {
    const r = await apiPost('autoRole', autoRoleEnabled ? autoRoleSelect : null);
    r.success ? showToast('✅ Oto-rol kaydedildi!') : showToast('Hata oluştu', 'error');
  };

  const saveLogChannel = async () => {
    if (!logChannel) return showToast('Bir kanal seç!', 'error');
    const r = await apiPost('logChannel', logChannel);
    r.success ? showToast('✅ Log kanalı kaydedildi!') : showToast('Hata oluştu', 'error');
  };

  const removeLogChannel = async () => {
    const r = await apiPost('logChannel', null);
    setLogChannel('');
    r.success ? showToast('🗑️ Log kanalı kaldırıldı') : showToast('Hata oluştu', 'error');
  };

  const saveTicketChannel = async () => {
    if (!ticketChannel) return showToast('Bir kanal seç!', 'error');
    const r = await apiPost('ticketChannel', ticketChannel);
    r.success ? showToast('✅ Ticket paneli kuruldu!') : showToast('Hata oluştu', 'error');
  };

  const removeTicketChannel = async () => {
    const r = await apiPost('ticketChannel', null);
    setTicketChannel('');
    r.success ? showToast('🗑️ Ticket sistemi kaldırıldı') : showToast('Hata oluştu', 'error');
  };

  const saveProtection = async () => {
    const r = await apiPost('protection', protection);
    r.success ? showToast('✅ Koruma ayarları kaydedildi!') : showToast('Hata oluştu', 'error');
  };

  const renderPreview = () => {
    if (!welcomeMsg) return <span style={{ color: 'var(--muted)' }}>Mesajı yukarıya yaz...</span>;
    let html = welcomeMsg
      .replace('{user}', `<strong>@${user?.username || 'Kullanıcı'}</strong>`)
      .replace('{server}', `<strong>${guildData?.guild?.name || 'Sunucu'}</strong>`)
      .replace('{count}', `<strong>${guildData?.guild?.memberCount || '0'}</strong>`);
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  };

  return (
    <>
      {/* LOGIN VIEW */}
      <div className={`view ${view === 'login' ? 'active' : ''}`} id="loginView">
        <div className="login-glow"></div>
        <img src="https://cdn.discordapp.com/attachments/1383860752074407976/1485330048067043539/20260321_235616.png" className="login-logo" alt="Jarvis" />
        <div>
          <div className="login-title">Jarvis Dashboard</div>
          <p className="login-sub">Discord sunucularını kolayca yönet.<br/>Otorol, ticket, log ve daha fazlası.</p>
        </div>
        <button onClick={handleLogin} className="btn-discord">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
          Discord ile Giriş Yap
        </button>
        <div className="login-features">
          <div className="feature-badge"><span>🎫</span> Ticket Sistemi</div>
          <div className="feature-badge"><span>🎭</span> Oto-Rol</div>
          <div className="feature-badge"><span>📋</span> Log Kanalı</div>
          <div className="feature-badge"><span>👋</span> Hoş Geldin</div>
          <div className="feature-badge"><span>🛡️</span> Sunucu Koruma</div>
        </div>
      </div>

      {/* GUILDS VIEW */}
      <div className={`view ${view === 'guilds' ? 'active' : ''}`} id="guildsView">
        <div className="guilds-header">
          <h1>Sunucularını Seç</h1>
          <p>Yönetmek istediğin sunucuyu seç</p>
        </div>
        <div className="guilds-grid">
          {loadingGuilds ? (
            <div className="loader" style={{ gridColumn: '1/-1' }}><div className="spinner"></div></div>
          ) : guilds.length === 0 ? (
            <div className="empty" style={{ gridColumn: '1/-1' }}>
              <div className="empty-icon">🤖</div>
              <h3>Sunucu bulunamadı</h3>
              <p>Yönetici yetkisine sahip olduğunuz bir sunucu yok.</p>
            </div>
          ) : (
            guilds.map(g => (
              <div key={g.id} className="guild-card" onClick={() => openGuild(g.id)}>
                <div className="guild-icon">
                  {g.icon ? <img src={`https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png`} alt="" /> : g.name.charAt(0).toUpperCase()}
                </div>
                <div className="guild-name">{g.name}</div>
                <div className="guild-manage">Yönet →</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* DASHBOARD VIEW */}
      <div className={`view ${view === 'dash' ? 'active' : ''}`} id="dashView">
        {loadingGuildData ? (
          <div className="loader" style={{ width: '100%' }}><div className="spinner"></div></div>
        ) : guildData && (
          <>
            {/* Sidebar */}
            <aside className="sidebar">
              <div className="sidebar-guild">
                <div className="sidebar-guild-icon">
                  {guildData.guild.icon ? <img src={guildData.guild.icon} alt="" /> : guildData.guild.name.charAt(0)}
                </div>
                <div>
                  <div className="sidebar-guild-name">{guildData.guild.name}</div>
                  <div className="sidebar-guild-members">{guildData.guild.memberCount} üye</div>
                </div>
              </div>
              <nav className="sidebar-nav">
                <div className="nav-label">Genel</div>
                <button className={`nav-item ${activeTab === 'welcome' ? 'active' : ''}`} onClick={() => setActiveTab('welcome')}>
                  <span className="nav-icon">👋</span> Hoş Geldin
                </button>
                <button className={`nav-item ${activeTab === 'autorole' ? 'active' : ''}`} onClick={() => setActiveTab('autorole')}>
                  <span className="nav-icon">🎭</span> Oto-Rol
                </button>
                <button className={`nav-item ${activeTab === 'log' ? 'active' : ''}`} onClick={() => setActiveTab('log')}>
                  <span className="nav-icon">📋</span> Log Kanalı
                </button>
                <button className={`nav-item ${activeTab === 'ticket' ? 'active' : ''}`} onClick={() => setActiveTab('ticket')}>
                  <span className="nav-icon">🎫</span> Ticket Sistemi
                </button>
                <div className="nav-label">Güvenlik</div>
                <button className={`nav-item ${activeTab === 'protection' ? 'active' : ''}`} onClick={() => setActiveTab('protection')}>
                  <span className="nav-icon">🛡️</span> Sunucu Koruma
                </button>
              </nav>
              <div className="sidebar-bottom">
                <div className="user-pill">
                  <div className="user-avatar">
                    {user?.avatar ? <img src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`} alt="" /> : null}
                  </div>
                  <span className="user-name">{user?.username || 'Kullanıcı'}</span>
                  <button className="logout-btn" onClick={handleLogout} title="Çıkış">⏏</button>
                </div>
              </div>
            </aside>

            {/* Main Content */}
            <main className="main-content">
              <button className="back-btn" onClick={() => { setView('guilds'); loadGuilds(); }}>← Sunucu Listesi</button>

              {/* HOŞ GELDİN */}
              <div className={`tab-content ${activeTab === 'welcome' ? 'active' : ''}`}>
                <div className="page-title">👋 Hoş Geldin Mesajı</div>
                <div className="page-sub">Sunucuya yeni katılan üyelere otomatik mesaj gönder</div>
                <div className="card">
                  <div className="card-header">
                    <div>
                      <div className="card-title">Hoş Geldin Mesajı</div>
                      <div className="card-desc">Aktif olduğunda yeni üyelere mesaj gönderilir</div>
                    </div>
                    <div className={`toggle ${welcomeEnabled ? 'on' : ''}`} onClick={() => setWelcomeEnabled(!welcomeEnabled)}></div>
                  </div>
                  <div className="field">
                    <label>Kanal</label>
                    <select value={welcomeChannel} onChange={e => setWelcomeChannel(e.target.value)}>
                      <option value="">Kanal seç...</option>
                      {guildData.channels.map((c: any) => <option key={c.id} value={c.id}>#{c.name}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Mesaj <small style={{ color: 'var(--muted)', fontWeight: 400 }}>• {'{user}'} = etiket, {'{server}'} = sunucu adı, {'{count}'} = üye sayısı</small></label>
                    <textarea rows={3} placeholder="{user} sunucumuza hoş geldin! 🎉" value={welcomeMsg} onChange={e => setWelcomeMsg(e.target.value)}></textarea>
                  </div>
                  <div className="field">
                    <label>Önizleme</label>
                    <div className="preview-box">{renderPreview()}</div>
                  </div>
                  <button className="btn btn-primary" onClick={saveWelcome}>💾 Kaydet</button>
                </div>
              </div>

              {/* OTO-ROL */}
              <div className={`tab-content ${activeTab === 'autorole' ? 'active' : ''}`}>
                <div className="page-title">🎭 Oto-Rol</div>
                <div className="page-sub">Sunucuya katılan herkese otomatik rol ver</div>
                <div className="card">
                  <div className="card-header">
                    <div>
                      <div className="card-title">Oto-Rol Sistemi</div>
                      <div className="card-desc">Yeni üyeye seçilen rol otomatik verilir</div>
                    </div>
                    <div className={`toggle ${autoRoleEnabled ? 'on' : ''}`} onClick={() => setAutoRoleEnabled(!autoRoleEnabled)}></div>
                  </div>
                  <div className="field">
                    <label>Verilecek Rol</label>
                    <select value={autoRoleSelect} onChange={e => setAutoRoleSelect(e.target.value)}>
                      <option value="">Rol seç...</option>
                      {guildData.roles.map((r: any) => <option key={r.id} value={r.id}>@{r.name}</option>)}
                    </select>
                  </div>
                  <button className="btn btn-primary" onClick={saveAutoRole}>💾 Kaydet</button>
                </div>
              </div>

              {/* LOG KANALI */}
              <div className={`tab-content ${activeTab === 'log' ? 'active' : ''}`}>
                <div className="page-title">📋 Log Kanalı</div>
                <div className="page-sub">Bot işlemlerinin loglandığı kanalı seç</div>
                <div className="card">
                  <div className="card-title" style={{ marginBottom: 16 }}>Log Kanalı Ayarla</div>
                  <div className="field">
                    <label>Kanal</label>
                    <select value={logChannel} onChange={e => setLogChannel(e.target.value)}>
                      <option value="">Kanal seç...</option>
                      {guildData.channels.map((c: any) => <option key={c.id} value={c.id}>#{c.name}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" onClick={saveLogChannel}>💾 Kaydet</button>
                    <button className="btn btn-danger" onClick={removeLogChannel}>🗑️ Kaldır</button>
                  </div>
                </div>
                <div className="card">
                  <div className="card-title" style={{ marginBottom: 8 }}>📌 Log Neler Kaydeder?</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                    <div style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', gap: 8, alignItems: 'center' }}><span>⛔</span> Kara liste işlemleri</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', gap: 8, alignItems: 'center' }}><span>🎭</span> Oto-rol verilenler</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', gap: 8, alignItems: 'center' }}><span>🎫</span> Ticket açma/kapama</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', gap: 8, alignItems: 'center' }}><span>⚙️</span> Ayar değişiklikleri</div>
                  </div>
                </div>
              </div>

              {/* TICKET */}
              <div className={`tab-content ${activeTab === 'ticket' ? 'active' : ''}`}>
                <div className="page-title">🎫 Ticket Sistemi</div>
                <div className="page-sub">Destek ticket panelini kurmak için kanal seç</div>
                <div className="card">
                  <div className="card-title" style={{ marginBottom: 16 }}>Ticket Panel Kanalı</div>
                  <div className="field">
                    <label>Panel Kanalı</label>
                    <select value={ticketChannel} onChange={e => setTicketChannel(e.target.value)}>
                      <option value="">Kanal seç...</option>
                      {guildData.channels.map((c: any) => <option key={c.id} value={c.id}>#{c.name}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" onClick={saveTicketChannel}>🚀 Paneli Kur</button>
                    <button className="btn btn-danger" onClick={removeTicketChannel}>🗑️ Kaldır</button>
                  </div>
                </div>
                <div className="card">
                  <div className="card-title" style={{ marginBottom: 8 }}>🎫 Ticket Nasıl Çalışır?</div>
                  <div style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.8, marginTop: 12 }}>
                    1. Seçilen kanala ticket paneli gönderilir<br/>
                    2. Kullanıcı <strong style={{ color: 'var(--text)' }}>🎫 Ticket Aç</strong> butonuna basar<br/>
                    3. Otomatik gizli kanal açılır (<code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: 4 }}>ticket-001</code>...)<br/>
                    4. Yetkili ve kullanıcı soruyu çözer<br/>
                      5. <strong style={{ color: 'var(--text)' }}>🔒 Ticket Kapat</strong> ile kanal silinir
                  </div>
                </div>
              </div>

              {/* KORUMA */}
              <div className={`tab-content ${activeTab === 'protection' ? 'active' : ''}`}>
                <div className="page-title">🛡️ Sunucu Koruma</div>
                <div className="page-sub">Sunucunu spam, link ve mention saldırılarından koru</div>
                <div className="card">
                  <div className="card-title" style={{ marginBottom: 20 }}>Koruma Ayarları</div>
                  <div className="protection-grid">
                    <div className="toggle-wrap" style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, background: 'rgba(255,255,255,0.02)' }}>
                      <div className="toggle-info">
                        <div className="toggle-label">🚫 Anti-Spam</div>
                        <div className="toggle-sub">Çok hızlı mesaj atanları engelle</div>
                      </div>
                      <div className={`toggle ${protection.antiSpam ? 'on' : ''}`} onClick={() => setProtection({ ...protection, antiSpam: !protection.antiSpam })}></div>
                    </div>
                    <div className="toggle-wrap" style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, background: 'rgba(255,255,255,0.02)' }}>
                      <div className="toggle-info">
                        <div className="toggle-label">🔗 Anti-Link</div>
                        <div className="toggle-sub">Yetkisiz link paylaşımını engelle</div>
                      </div>
                      <div className={`toggle ${protection.antiLink ? 'on' : ''}`} onClick={() => setProtection({ ...protection, antiLink: !protection.antiLink })}></div>
                    </div>
                    <div className="toggle-wrap" style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, background: 'rgba(255,255,255,0.02)' }}>
                      <div className="toggle-info">
                        <div className="toggle-label">📢 Anti-Mention</div>
                        <div className="toggle-sub">Toplu mention saldırısını engelle</div>
                      </div>
                      <div className={`toggle ${protection.antiMention ? 'on' : ''}`} onClick={() => setProtection({ ...protection, antiMention: !protection.antiMention })}></div>
                    </div>
                  </div>
                  <hr className="divider" />
                  <button className="btn btn-primary" onClick={saveProtection}>💾 Kaydet</button>
                </div>
              </div>
            </main>
          </>
        )}
      </div>

      {/* TOAST */}
      <div className={`toast ${toast ? `show ${toast.type}` : ''}`} id="toast">
        {toast?.msg}
      </div>
    </>
  );
}
