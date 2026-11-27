import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, type IconName } from '../components/Icon';
import type { API } from '../operations/UI';
import './work-discussions.css';

interface ChannelItem {
  id: string;
  slug: string;
  name: string;
  category: string;
  topic: string;
  icon: string;
  message_count: number;
}

interface MemberProfile {
  id: string;
  email: string;
  role: string;
  display_name: string;
  username: string;
  avatar_url: string;
}

interface ChannelMessage {
  id: string;
  channel_id: string;
  body: string;
  is_agent: boolean;
  author_id: string;
  author_name: string;
  author_username: string;
  author_avatar_url: string;
  author_role: string;
  reply_to: string | null;
  reply_preview: {
    id: string;
    author_name: string;
    author_username: string;
    author_avatar_url: string;
    is_agent: boolean;
    body: string;
  } | null;
  mentions: string[];
  agent_run: {
    run_id: string;
    status: string;
    tool_name: string;
    approval_id: string | null;
    credits_used?: number;
  } | null;
  created_at: string;
}

function initialsOf(name: string): string {
  return (name || 'M')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

function formatDayDivider(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today at ${timeStr}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return `Yesterday at ${timeStr}`;
  }
  return `${d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })} ${timeStr}`;
}

function channelIcon(icon: string): IconName | null {
  if (icon === 'megaphone') return 'megaphone';
  if (icon === 'book') return 'book';
  if (icon === 'lifebuoy') return 'lifebuoy';
  if (icon === 'bolt') return 'bolt';
  if (icon === 'grid') return 'grid';
  if (icon === 'layers') return 'layers';
  if (icon === 'users') return 'users';
  return null;
}

function renderFormattedBody(body: string, agentHandle: string) {
  const parts = body.split(/(@[a-zA-Z0-9._-]+)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('@') && part.length > 2) {
      const isAgent = part.slice(1).toLowerCase() === agentHandle.toLowerCase();
      return (
        <span
          key={idx}
          className={isAgent ? 'dc-mention dc-mention-agent' : 'dc-mention'}
        >
          {part}
        </span>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

export function WorkDiscussions({
  api,
  scope,
  currency = 'KES',
}: {
  api: API;
  scope: string;
  currency?: string;
}) {
  const [directory, setDirectory] = useState<{
    workspace: { id: string; name: string; events_count: number; members_count: number };
    agent: { handle: string; display_name: string; autonomy_mode: string; can_configure: boolean };
    current_user: MemberProfile | null;
    members: MemberProfile[];
    channels: ChannelItem[];
  } | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string>('');
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<ChannelMessage | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMembers, setShowMembers] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelCategory, setNewChannelCategory] = useState('DISCUSSIONS');
  const [newChannelTopic, setNewChannelTopic] = useState('');
  const [showAgentSetup, setShowAgentSetup] = useState(false);
  const [agentHandleInput, setAgentHandleInput] = useState('');
  const [agentNameInput, setAgentNameInput] = useState('');
  const [showGuide, setShowGuide] = useState(false);
  const [mobileRailOpen, setMobileRailOpen] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const feedEndRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  async function loadDirectory(keepSelection = true) {
    setError('');
    try {
      const res = await api('/work/channels');
      setDirectory(res);
      setAgentHandleInput(res.agent?.handle || 'workspace-agent');
      setAgentNameInput(res.agent?.display_name || 'Workspace Agent');
      if (!keepSelection || !activeChannelId) {
        const preferred =
          res.channels?.find((c: ChannelItem) => c.slug === 'general-questions') ||
          res.channels?.find((c: ChannelItem) => c.slug === 'general') ||
          res.channels?.[0];
        if (preferred) setActiveChannelId(preferred.id);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingChannels(false);
    }
  }

  async function loadMessages(channelId: string) {
    if (!channelId) return;
    setLoadingMessages(true);
    try {
      const res = await api(`/work/channels/${channelId}/messages`);
      setMessages(res.data || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMessages(false);
    }
  }

  useEffect(() => {
    setLoadingChannels(true);
    setActiveChannelId('');
    setMessages([]);
    void loadDirectory(false);
  }, [scope]);

  useEffect(() => {
    if (activeChannelId) {
      setReplyTo(null);
      setSearchQuery('');
      void loadMessages(activeChannelId);
    }
  }, [activeChannelId]);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  const activeChannel = useMemo(
    () => directory?.channels.find((c) => c.id === activeChannelId) || null,
    [directory, activeChannelId],
  );

  const categories = useMemo(() => {
    const groups = new Map<string, ChannelItem[]>();
    for (const ch of directory?.channels || []) {
      const cat = ch.category || 'DISCUSSIONS';
      const list = groups.get(cat) || [];
      list.push(ch);
      groups.set(cat, list);
    }
    return [...groups.entries()];
  }, [directory]);

  const agentHandle = directory?.agent.handle || 'workspace-agent';
  const agentDisplayName = directory?.agent.display_name || 'Workspace Agent';

  // Detect live @mention autocomplete token at the end of draft
  const mentionQuery = useMemo(() => {
    const m = draft.match(/(?:^|\s)@([a-zA-Z0-9._-]*)$/);
    return m ? m[1].toLowerCase() : null;
  }, [draft]);

  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const list: { handle: string; label: string; sub: string; isAgent?: boolean; avatar?: string }[] = [
      {
        handle: agentHandle,
        label: agentDisplayName,
        sub: 'Autonomous Agent · Responds live in channel',
        isAgent: true,
      },
      ...(directory?.members || []).map((m) => ({
        handle: m.username,
        label: m.display_name,
        sub: m.role,
        avatar: m.avatar_url,
      })),
    ];
    return list
      .filter(
        (c) =>
          !mentionQuery ||
          c.handle.toLowerCase().includes(mentionQuery) ||
          c.label.toLowerCase().includes(mentionQuery),
      )
      .slice(0, 6);
  }, [mentionQuery, agentHandle, agentDisplayName, directory]);

  function insertMention(handle: string) {
    setDraft((prev) => {
      if (/(?:^|\s)@[a-zA-Z0-9._-]*$/.test(prev)) {
        return prev.replace(/@[a-zA-Z0-9._-]*$/, `@${handle} `);
      }
      return `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}@${handle} `;
    });
    composerRef.current?.focus();
  }

  async function sendMessage(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const clean = draft.trim();
    if (!clean || !activeChannelId || sending) return;
    setSending(true);
    setError('');
    try {
      const res = await api(`/work/channels/${activeChannelId}/messages`, 'POST', {
        body: clean,
        reply_to: replyTo?.id || null,
        mentions: [],
        currency,
      });
      setDraft('');
      setReplyTo(null);
      setMessages((prev) => {
        const next = [...prev];
        if (res.message && !next.some((m) => m.id === res.message.id)) next.push(res.message);
        if (res.agent_reply && !next.some((m) => m.id === res.agent_reply.id))
          next.push(res.agent_reply);
        return next;
      });
      void loadDirectory(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function createChannel(e: React.FormEvent) {
    e.preventDefault();
    if (!newChannelName.trim()) return;
    setError('');
    try {
      const created = await api('/work/channels', 'POST', {
        name: newChannelName.trim(),
        category: newChannelCategory,
        topic: newChannelTopic.trim(),
        icon: 'hash',
      });
      setNewChannelName('');
      setNewChannelTopic('');
      setShowCreateChannel(false);
      await loadDirectory(true);
      setActiveChannelId(created.id);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function saveAgentIdentity(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/agent/permissions', 'PUT', {
        agent_handle: agentHandleInput.replace(/^@+/, '').trim().toLowerCase(),
        agent_display_name: agentNameInput.trim(),
      });
      setShowAgentSetup(false);
      await loadDirectory(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function decideChannelApproval(approvalId: string, decision: 'approve' | 'reject') {
    setDecidingId(approvalId);
    setError('');
    try {
      await api(`/agent/approvals/${approvalId}/decide`, 'POST', { decision, note: '' });
      await loadMessages(activeChannelId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDecidingId(null);
    }
  }

  const visibleMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter(
      (m) =>
        m.body.toLowerCase().includes(q) ||
        m.author_name.toLowerCase().includes(q) ||
        m.author_username.toLowerCase().includes(q),
    );
  }, [messages, searchQuery]);

  if (loadingChannels) {
    return (
      <div className="dc-loading" role="status">
        Loading workspace discussions…
      </div>
    );
  }

  return (
    <section className="dc-shell" aria-label="Workspace Discussions">
      {/* Left Discord-Style Server & Channels Sidebar */}
      <aside className={mobileRailOpen ? 'dc-rail is-open' : 'dc-rail'}>
        <header className="dc-server-banner">
          <div className="dc-server-banner-top">
            <strong className="dc-server-name">{directory?.workspace.name || 'Workspace'}</strong>
            <button
              type="button"
              className="dc-rail-icon-btn"
              title="Create channel"
              aria-label="Create channel"
              onClick={() => setShowCreateChannel((v) => !v)}
            >
              +
            </button>
          </div>
          <p className="dc-server-tagline">
            Sandboxed Team Server · Mention <code>@{agentHandle}</code>
          </p>
        </header>

        <div className="dc-server-meta">
          <button
            type="button"
            className={showGuide ? 'dc-meta-row is-active' : 'dc-meta-row'}
            onClick={() => setShowGuide((v) => !v)}
          >
            <Icon name="book" width={15} height={15} />
            <span>Workspace Guide</span>
          </button>
          <div className="dc-meta-row dc-meta-static">
            <Icon name="calendar" width={15} height={15} />
            <span>{directory?.workspace.events_count || 0} Scheduled Events</span>
          </div>
          <button
            type="button"
            className={showAgentSetup ? 'dc-meta-row is-active' : 'dc-meta-row'}
            onClick={() => {
              if (directory?.agent.can_configure) setShowAgentSetup((v) => !v);
              else insertMention(agentHandle);
            }}
          >
            <span className="dc-online-dot" aria-hidden="true" />
            <span className="dc-truncate">@{agentHandle}</span>
            <span className="dc-mini-badge">AGENT</span>
          </button>
        </div>

        {showCreateChannel && (
          <form className="dc-inline-card" onSubmit={createChannel}>
            <div className="dc-inline-card-head">
              <strong>New channel</strong>
              <button
                type="button"
                className="dc-close-xs"
                onClick={() => setShowCreateChannel(false)}
              >
                ×
              </button>
            </div>
            <input
              required
              minLength={2}
              maxLength={40}
              placeholder="e.g. finance-ops"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
            />
            <select
              value={newChannelCategory}
              onChange={(e) => setNewChannelCategory(e.target.value)}
            >
              <option value="INFO">INFO</option>
              <option value="DISCUSSIONS">DISCUSSIONS</option>
              <option value="PROJECTS">PROJECTS</option>
            </select>
            <input
              placeholder="Channel topic (optional)"
              value={newChannelTopic}
              onChange={(e) => setNewChannelTopic(e.target.value)}
            />
            <button type="submit" className="dc-btn-primary">
              Create #channel
            </button>
          </form>
        )}

        {showAgentSetup && directory?.agent.can_configure && (
          <form className="dc-inline-card" onSubmit={saveAgentIdentity}>
            <div className="dc-inline-card-head">
              <strong>Configure Agent @handle</strong>
              <button
                type="button"
                className="dc-close-xs"
                onClick={() => setShowAgentSetup(false)}
              >
                ×
              </button>
            </div>
            <label className="dc-inline-label">
              <span>Agent username</span>
              <input
                required
                value={agentHandleInput}
                onChange={(e) => setAgentHandleInput(e.target.value)}
                placeholder="continua-agent"
              />
            </label>
            <label className="dc-inline-label">
              <span>Display name</span>
              <input
                required
                value={agentNameInput}
                onChange={(e) => setAgentNameInput(e.target.value)}
                placeholder="Continua Agent"
              />
            </label>
            <button type="submit" className="dc-btn-primary">
              Save @{agentHandleInput.replace(/^@+/, '') || 'agent'}
            </button>
          </form>
        )}

        <nav className="dc-channels-scroll" aria-label="Workspace discussion channels">
          {categories.map(([cat, list]) => {
            const collapsed = !!collapsedCategories[cat];
            return (
              <div key={cat} className="dc-category-group">
                <button
                  type="button"
                  className="dc-category-header"
                  aria-expanded={!collapsed}
                  onClick={() =>
                    setCollapsedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }))
                  }
                >
                  <span className="dc-chevron">{collapsed ? '▸' : '▾'}</span>
                  <span>{cat}</span>
                </button>
                {!collapsed && (
                  <ul className="dc-channel-list">
                    {list.map((ch) => {
                      const ic = channelIcon(ch.icon);
                      const isActive = ch.id === activeChannelId;
                      return (
                        <li key={ch.id}>
                          <button
                            type="button"
                            className={isActive ? 'dc-channel-btn is-active' : 'dc-channel-btn'}
                            aria-current={isActive ? 'page' : undefined}
                            onClick={() => {
                              setActiveChannelId(ch.id);
                              setMobileRailOpen(false);
                            }}
                          >
                            <span className="dc-channel-hash" aria-hidden="true">
                              {ic ? <Icon name={ic} width={15} height={15} /> : '#'}
                            </span>
                            <span className="dc-channel-name">{ch.name}</span>
                            {ch.message_count > 0 && (
                              <span className="dc-channel-count">{ch.message_count}</span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>

        {/* Bottom-left User Profile Dock (matches Discord 2nd image) */}
        <footer className="dc-user-dock">
          <div className="dc-user-dock-identity">
            <div className="dc-avatar-wrap dc-avatar-sm">
              {directory?.current_user?.avatar_url ? (
                <img
                  src={directory.current_user.avatar_url}
                  alt={directory.current_user.display_name}
                  className="dc-avatar-img"
                />
              ) : (
                <span className="dc-avatar-fallback">
                  {initialsOf(directory?.current_user?.display_name || 'Me')}
                </span>
              )}
              <span className="dc-status-dot" aria-hidden="true" />
            </div>
            <div className="dc-user-dock-text">
              <strong>{directory?.current_user?.username || 'member'}</strong>
              <small>{directory?.current_user?.role || 'Online'}</small>
            </div>
          </div>
          <a
            href="/app/account"
            className="dc-dock-gear"
            title="Profile picture & account settings"
            aria-label="Edit profile picture and account settings"
          >
            <Icon name="settings" width={16} height={16} />
          </a>
        </footer>
      </aside>

      {/* Main Discord-Style Channel Stream */}
      <div className="dc-main">
        <header className="dc-topbar">
          <div className="dc-topbar-left">
            <button
              type="button"
              className="dc-mobile-rail-btn"
              onClick={() => setMobileRailOpen((v) => !v)}
              aria-label="Toggle channels list"
            >
              <Icon name="menu" width={17} height={17} />
            </button>
            <span className="dc-topbar-hash" aria-hidden="true">
              #
            </span>
            <strong className="dc-topbar-title">{activeChannel?.name || 'general'}</strong>
            {activeChannel?.topic && (
              <>
                <span className="dc-topbar-divider" aria-hidden="true" />
                <span className="dc-topbar-topic">{activeChannel.topic}</span>
              </>
            )}
          </div>
          <div className="dc-topbar-right">
            <button
              type="button"
              className="dc-agent-ping-btn"
              onClick={() => insertMention(agentHandle)}
              title={`Mention @${agentHandle} in this channel`}
            >
              <Icon name="bolt" width={14} height={14} />
              <span>@{agentHandle}</span>
            </button>
            <button
              type="button"
              className={showMembers ? 'dc-top-icon-btn is-active' : 'dc-top-icon-btn'}
              title="Toggle workspace members"
              aria-label="Toggle workspace members"
              onClick={() => setShowMembers((v) => !v)}
            >
              <Icon name="users" width={16} height={16} />
            </button>
            <div className="dc-search-box">
              <input
                type="search"
                aria-label="Search channel messages"
                placeholder={`Search #${activeChannel?.name || 'channel'}`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Icon name="search" width={14} height={14} />
            </div>
          </div>
        </header>

        {showGuide && (
          <div className="dc-guide-banner">
            <div>
              <strong>How team discussions &amp; @{agentHandle} work</strong>
              <p>
                Every channel stays inside this Business workspace—no private employee DMs or
                cross-workspace leaks. Mention <code>@{agentHandle}</code> to ask about overdue
                invoices, upcoming meetings, active projects, summarize a channel, or stage actions.
              </p>
            </div>
            <button type="button" className="dc-close-xs" onClick={() => setShowGuide(false)}>
              ×
            </button>
          </div>
        )}

        {error && (
          <div className="dc-error-bar" role="alert">
            {error}
          </div>
        )}

        <div className="dc-content-split">
          <div className="dc-stream-col">
            <div className="dc-messages-scroll">
              <div className="dc-channel-welcome">
                <div className="dc-welcome-badge">#</div>
                <h3>Welcome to #{activeChannel?.name || 'general'}!</h3>
                <p>
                  {activeChannel?.topic || 'This is the start of this workspace channel.'} Mention{' '}
                  <button
                    type="button"
                    className="dc-inline-mention-link"
                    onClick={() => insertMention(agentHandle)}
                  >
                    @{agentHandle}
                  </button>{' '}
                  anytime for live operational answers or to trigger agent workflows.
                </p>
              </div>

              {loadingMessages && <p className="dc-stream-status">Loading messages…</p>}

              {!loadingMessages && visibleMessages.length === 0 && (
                <div className="dc-empty-prompts">
                  <p>Start the conversation or ask your workspace agent:</p>
                  <div className="dc-starter-row">
                    {[
                      `@${agentHandle} what needs our attention today?`,
                      `@${agentHandle} what meetings are coming up?`,
                      `@${agentHandle} summarize active projects and open tasks`,
                    ].map((starter) => (
                      <button
                        key={starter}
                        type="button"
                        className="dc-starter-chip"
                        onClick={() => {
                          setDraft(starter);
                          composerRef.current?.focus();
                        }}
                      >
                        {starter}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {visibleMessages.map((msg, idx) => {
                const prev = idx > 0 ? visibleMessages[idx - 1] : null;
                const dayLabel = formatDayDivider(msg.created_at);
                const prevDayLabel = prev ? formatDayDivider(prev.created_at) : '';
                const showDay = dayLabel && dayLabel !== prevDayLabel;
                return (
                  <div key={msg.id}>
                    {showDay && (
                      <div className="dc-date-divider" role="separator">
                        <span>{dayLabel}</span>
                      </div>
                    )}
                    <article
                      className={msg.is_agent ? 'dc-message dc-message-agent' : 'dc-message'}
                    >
                      {msg.reply_preview && (
                        <div className="dc-reply-context">
                          <span className="dc-reply-spine" aria-hidden="true" />
                          <span className="dc-reply-avatar">
                            {msg.reply_preview.is_agent ? (
                              <Icon name="bolt" width={11} height={11} />
                            ) : msg.reply_preview.author_avatar_url ? (
                              <img src={msg.reply_preview.author_avatar_url} alt="" />
                            ) : (
                              initialsOf(msg.reply_preview.author_name).slice(0, 1)
                            )}
                          </span>
                          <span className="dc-reply-author">
                            @{msg.reply_preview.author_username}
                          </span>
                          <span className="dc-reply-snippet">{msg.reply_preview.body}</span>
                        </div>
                      )}

                      <div className="dc-message-row">
                        <div
                          className={
                            msg.is_agent
                              ? 'dc-avatar-wrap dc-avatar-agent'
                              : 'dc-avatar-wrap'
                          }
                        >
                          {msg.is_agent ? (
                            <Icon name="bolt" width={19} height={19} />
                          ) : msg.author_avatar_url ? (
                            <img
                              src={msg.author_avatar_url}
                              alt={msg.author_name}
                              className="dc-avatar-img"
                            />
                          ) : (
                            <span className="dc-avatar-fallback">
                              {initialsOf(msg.author_name)}
                            </span>
                          )}
                        </div>

                        <div className="dc-message-content">
                          <div className="dc-message-head">
                            <strong
                              className={
                                msg.is_agent ? 'dc-author-name dc-author-agent' : 'dc-author-name'
                              }
                            >
                              {msg.author_name}
                            </strong>
                            {msg.is_agent ? (
                              <span className="dc-role-pill dc-role-agent">
                                AGENT · @{msg.author_username}
                              </span>
                            ) : (
                              <span className="dc-author-handle">@{msg.author_username}</span>
                            )}
                            {!msg.is_agent && ['owner', 'admin'].includes(msg.author_role) && (
                              <span className="dc-role-pill">{msg.author_role}</span>
                            )}
                            <time className="dc-timestamp" dateTime={msg.created_at}>
                              {formatTimestamp(msg.created_at)}
                            </time>
                          </div>

                          <div className="dc-message-body">
                            {renderFormattedBody(msg.body, agentHandle)}
                          </div>

                          {msg.agent_run?.approval_id && msg.agent_run.status === 'awaiting_approval' && (
                            <div className="dc-agent-action-embed">
                              <span>
                                Action staged by <code>@{agentHandle}</code> (owner approval
                                required)
                              </span>
                              <div className="dc-embed-btns">
                                <button
                                  type="button"
                                  className="dc-btn-primary"
                                  disabled={decidingId === msg.agent_run.approval_id}
                                  onClick={() =>
                                    void decideChannelApproval(
                                      msg.agent_run!.approval_id!,
                                      'approve',
                                    )
                                  }
                                >
                                  Approve &amp; Execute
                                </button>
                                <button
                                  type="button"
                                  className="dc-btn-secondary"
                                  disabled={decidingId === msg.agent_run.approval_id}
                                  onClick={() =>
                                    void decideChannelApproval(
                                      msg.agent_run!.approval_id!,
                                      'reject',
                                    )
                                  }
                                >
                                  Reject
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="dc-message-actions">
                          <button
                            type="button"
                            className="dc-msg-action-btn"
                            title="Reply to message"
                            onClick={() => {
                              setReplyTo(msg);
                              composerRef.current?.focus();
                            }}
                          >
                            Reply
                          </button>
                        </div>
                      </div>
                    </article>
                  </div>
                );
              })}
              <div ref={feedEndRef} />
            </div>

            {/* Bottom Discord-Style Message Composer with @Mention Autocomplete */}
            <div className="dc-composer-area">
              {mentionCandidates.length > 0 && (
                <div className="dc-mention-menu" role="listbox" aria-label="Mention suggestions">
                  {mentionCandidates.map((cand) => (
                    <button
                      key={cand.handle}
                      type="button"
                      className="dc-mention-option"
                      onClick={() => insertMention(cand.handle)}
                    >
                      <span
                        className={
                          cand.isAgent
                            ? 'dc-avatar-wrap dc-avatar-xs dc-avatar-agent'
                            : 'dc-avatar-wrap dc-avatar-xs'
                        }
                      >
                        {cand.isAgent ? (
                          <Icon name="bolt" width={13} height={13} />
                        ) : cand.avatar ? (
                          <img src={cand.avatar} alt="" className="dc-avatar-img" />
                        ) : (
                          <span className="dc-avatar-fallback">{initialsOf(cand.label)}</span>
                        )}
                      </span>
                      <span className="dc-mention-opt-text">
                        <strong>@{cand.handle}</strong>
                        <small>{cand.sub}</small>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {replyTo && (
                <div className="dc-reply-bar">
                  <span>
                    Replying to <strong>@{replyTo.author_username}</strong>:{' '}
                    {replyTo.body.slice(0, 80)}
                  </span>
                  <button
                    type="button"
                    className="dc-close-xs"
                    aria-label="Cancel reply"
                    onClick={() => setReplyTo(null)}
                  >
                    ×
                  </button>
                </div>
              )}

              <form className="dc-composer-box" onSubmit={sendMessage}>
                <button
                  type="button"
                  className="dc-composer-plus"
                  title={`Mention @${agentHandle}`}
                  aria-label={`Mention @${agentHandle}`}
                  onClick={() => insertMention(agentHandle)}
                >
                  +
                </button>
                <textarea
                  ref={composerRef}
                  rows={1}
                  className="dc-composer-input"
                  aria-label={`Message #${activeChannel?.name || 'channel'}`}
                  placeholder={`Message #${activeChannel?.name || 'general'} — type @${agentHandle} to ask the agent`}
                  value={draft}
                  disabled={sending}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                />
                <button
                  type="submit"
                  className="dc-composer-send"
                  disabled={sending || !draft.trim()}
                >
                  {sending ? '…' : 'Send'}
                </button>
              </form>
            </div>
          </div>

          {showMembers && (
            <aside className="dc-members-pane" aria-label="Workspace members">
              <h4>AUTONOMOUS AGENT — 1</h4>
              <div className="dc-member-item">
                <div className="dc-avatar-wrap dc-avatar-sm dc-avatar-agent">
                  <Icon name="bolt" width={15} height={15} />
                  <span className="dc-status-dot" />
                </div>
                <div>
                  <strong>{agentDisplayName}</strong>
                  <small>@{agentHandle} · Sandboxed</small>
                </div>
              </div>

              <h4>MEMBERS — {directory?.members.length || 0}</h4>
              {(directory?.members || []).map((m) => (
                <div key={m.id} className="dc-member-item">
                  <div className="dc-avatar-wrap dc-avatar-sm">
                    {m.avatar_url ? (
                      <img src={m.avatar_url} alt={m.display_name} className="dc-avatar-img" />
                    ) : (
                      <span className="dc-avatar-fallback">{initialsOf(m.display_name)}</span>
                    )}
                    <span className="dc-status-dot" />
                  </div>
                  <div>
                    <strong>{m.display_name}</strong>
                    <small>
                      @{m.username} · {m.role}
                    </small>
                  </div>
                </div>
              ))}
            </aside>
          )}
        </div>
      </div>
    </section>
  );
}
