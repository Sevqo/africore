import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { dbAll, dbGet } from '../db/adapter';
import { audit, fail, type Access } from '../platform/auth';
import {
  deriveUsername,
  getUserAvatarProfiles,
} from '../platform/profile-avatar';
import { all, create } from '../operations/store';
import { financialSnapshot } from '../operations/intelligence';
import { notify } from '../operations/automation';
import { authorize } from './store';
import { calendarEvents } from '../apps/phase3';
import { workProjects } from './work';
import { getAgentPolicy, runAgent } from '../agent/engine';
import { runPythonAgent } from '../agent/python-bridge';

export const workChannelCreateInput = z
  .object({
    name: z.string().trim().min(2).max(50),
    category: z.string().trim().min(2).max(32).default('WORKSPACE'),
    topic: z.string().trim().max(300).default(''),
    icon: z
      .enum(['hash', 'megaphone', 'book', 'lifebuoy', 'bolt', 'grid', 'layers', 'users'])
      .default('hash'),
  })
  .strict();

export const workChannelMessageInput = z
  .object({
    body: z.string().trim().min(1).max(6000),
    reply_to: z.string().uuid().nullable().default(null),
    mentions: z.array(z.string().uuid()).max(30).default([]),
    currency: z.enum(['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF']).default('KES'),
  })
  .strict();

const DEFAULT_CHANNELS: {
  slug: string;
  name: string;
  category: string;
  topic: string;
  icon: string;
  position: number;
}[] = [
  {
    slug: 'announcements',
    name: 'announcements',
    category: 'INFO',
    topic: 'Company-wide updates, launches, and leadership notices.',
    icon: 'megaphone',
    position: 1,
  },
  {
    slug: 'workspace-guidelines',
    name: 'workspace-guidelines',
    category: 'INFO',
    topic: 'Team communication standards, working hours, and agent collaboration tips.',
    icon: 'book',
    position: 2,
  },
  {
    slug: 'faq-resources',
    name: 'faq-resources',
    category: 'INFO',
    topic: 'Common operational questions, playbooks, and quick answers.',
    icon: 'lifebuoy',
    position: 3,
  },
  {
    slug: 'general',
    name: 'general',
    category: 'DISCUSSIONS',
    topic: 'Team-wide conversation, coordination, and daily check-ins.',
    icon: 'hash',
    position: 4,
  },
  {
    slug: 'general-questions',
    name: 'general-questions',
    category: 'DISCUSSIONS',
    topic: 'Ask operational questions or mention the workspace agent for instant answers.',
    icon: 'bolt',
    position: 5,
  },
  {
    slug: 'project-updates',
    name: 'project-updates',
    category: 'DISCUSSIONS',
    topic: 'Progress highlights, blockers, and milestones across Work projects.',
    icon: 'grid',
    position: 6,
  },
  {
    slug: 'feedback',
    name: 'feedback',
    category: 'DISCUSSIONS',
    topic: 'Share ideas, workflow improvements, and team feedback.',
    icon: 'layers',
    position: 7,
  },
];

function slugifyChannel(raw: string): string {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug.length >= 2 ? slug : 'channel-' + Date.now().toString().slice(-4);
}

async function ensureDefaultChannels(a: Access) {
  const existing = await all(a, 'work_channel');
  if (existing.length > 0) return existing;

  const created = [];
  for (const ch of DEFAULT_CHANNELS) {
    const row = await create(a, 'work_channel', {
      slug: ch.slug,
      name: ch.name,
      category: ch.category,
      topic: ch.topic,
      icon: ch.icon,
      position: ch.position,
      created_by: a.actor,
    });
    created.push(row);
  }
  return created;
}

async function loadWorkspaceMembersWithAvatars(orgId: string) {
  const rows = await dbAll(
    'SELECT u.id, u.email, m.role, p.display_name FROM ac_memberships m JOIN ac_users u ON u.id=m.user_id LEFT JOIN ac_profiles p ON p.user_id=u.id WHERE m.org_id=? ORDER BY u.email',
    [orgId],
  );
  const avatarMap = await getUserAvatarProfiles(rows.map((r: any) => String(r.id)));
  return rows.map((r: any) => {
    const extra = avatarMap.get(String(r.id));
    const displayName = String(r.display_name || r.email?.split('@')[0] || 'Member');
    return {
      id: String(r.id),
      email: String(r.email || ''),
      role: String(r.role || 'member'),
      display_name: displayName,
      username: extra?.username || deriveUsername(displayName, r.email),
      avatar_url: extra?.avatar_url || '',
    };
  });
}

export async function listWorkChannels(a: Access) {
  await authorize(a, 'work');
  const [channels, allMessages, orgRow, policy, members, eventsRes] = await Promise.all([
    ensureDefaultChannels(a),
    all(a, 'work_channel_message'),
    dbGet('SELECT id, name FROM ac_organizations WHERE id=?', [a.org]),
    getAgentPolicy(a),
    loadWorkspaceMembersWithAvatars(a.org),
    calendarEvents(a).catch(() => ({ data: [] })),
  ]);

  const countsByChannel = new Map<string, number>();
  for (const msg of allMessages) {
    const cid = String(msg.channel_id || '');
    countsByChannel.set(cid, (countsByChannel.get(cid) || 0) + 1);
  }

  const sortedChannels = [...channels]
    .sort((x, y) => Number(x.position || 99) - Number(y.position || 99) || String(x.created_at).localeCompare(String(y.created_at)))
    .map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      category: c.category || 'DISCUSSIONS',
      topic: c.topic || '',
      icon: c.icon || 'hash',
      message_count: countsByChannel.get(c.id) || 0,
      created_at: c.created_at,
    }));

  const currentMember = members.find((m) => m.id === a.actor) || null;

  return {
    workspace: {
      id: a.org,
      name: String(orgRow?.name || 'Workspace'),
      events_count: (eventsRes.data || []).length,
      members_count: members.length,
    },
    agent: {
      handle: policy.agent_handle,
      display_name: policy.agent_display_name,
      autonomy_mode: policy.autonomy_mode,
      can_configure: !a.api && ['owner', 'admin'].includes(a.role),
    },
    current_user: currentMember,
    members,
    channels: sortedChannels,
  };
}

export async function createWorkChannel(a: Access, input: unknown) {
  await authorize(a, 'work', undefined, true);
  const d = workChannelCreateInput.parse(input);
  const existing = await ensureDefaultChannels(a);
  const slug = slugifyChannel(d.name);
  if (existing.some((c) => c.slug === slug)) {
    fail(409, `Channel #${slug} already exists in this workspace`);
  }
  const row = await create(a, 'work_channel', {
    slug,
    name: slug,
    category: d.category.toUpperCase(),
    topic: d.topic || `Team discussions for #${slug}.`,
    icon: d.icon,
    position: existing.length + 1,
    created_by: a.actor,
  });
  await audit(a.org, a.actor, 'work.channel.created', row.id);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    topic: row.topic,
    icon: row.icon,
    message_count: 0,
    created_at: row.created_at,
  };
}

export async function listWorkChannelMessages(a: Access, channelId: string) {
  await authorize(a, 'work');
  const channels = await ensureDefaultChannels(a);
  const channel = channels.find((c) => c.id === channelId || c.slug === channelId);
  if (!channel) return fail(404, 'Discussion channel not found');

  const [allMessages, members, policy] = await Promise.all([
    all(a, 'work_channel_message'),
    loadWorkspaceMembersWithAvatars(a.org),
    getAgentPolicy(a),
  ]);

  const memberById = new Map(members.map((m) => [m.id, m]));
  const channelMsgs = allMessages
    .filter((m) => m.channel_id === channel.id)
    .sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)))
    .slice(-150);

  const byId = new Map(channelMsgs.map((m) => [m.id, m]));

  const formatted = channelMsgs.map((m) => formatChannelMessage(m, memberById, byId, policy));

  return {
    channel: {
      id: channel.id,
      slug: channel.slug,
      name: channel.name,
      category: channel.category,
      topic: channel.topic,
      icon: channel.icon,
    },
    agent: {
      handle: policy.agent_handle,
      display_name: policy.agent_display_name,
    },
    data: formatted,
  };
}

function formatChannelMessage(
  m: any,
  memberById: Map<string, any>,
  byId: Map<string, any>,
  policy: { agent_handle: string; agent_display_name: string },
) {
  const isAgent = !!m.is_agent;
  const member = !isAgent ? memberById.get(String(m.author_id || '')) : null;
  const replySource = m.reply_to ? byId.get(String(m.reply_to)) : null;
  const replyMember =
    replySource && !replySource.is_agent
      ? memberById.get(String(replySource.author_id || ''))
      : null;

  return {
    id: m.id,
    channel_id: m.channel_id,
    body: String(m.body || ''),
    is_agent: isAgent,
    author_id: isAgent ? 'agent' : String(m.author_id || ''),
    author_name: isAgent
      ? String(m.author_name || policy.agent_display_name)
      : member?.display_name || String(m.author_name || 'Member'),
    author_username: isAgent
      ? String(m.author_username || policy.agent_handle)
      : member?.username || 'member',
    author_avatar_url: isAgent ? '' : member?.avatar_url || '',
    author_role: isAgent ? 'AGENT' : member?.role || 'member',
    reply_to: m.reply_to || null,
    reply_preview: replySource
      ? {
          id: replySource.id,
          author_name: replySource.is_agent
            ? String(replySource.author_name || policy.agent_display_name)
            : replyMember?.display_name || String(replySource.author_name || 'Member'),
          author_username: replySource.is_agent
            ? String(replySource.author_username || policy.agent_handle)
            : replyMember?.username || 'member',
          author_avatar_url: replySource.is_agent ? '' : replyMember?.avatar_url || '',
          is_agent: !!replySource.is_agent,
          body: String(replySource.body || '').slice(0, 140),
        }
      : null,
    mentions: Array.isArray(m.mentions) ? m.mentions : [],
    agent_run: m.agent_run || null,
    created_at: m.created_at,
  };
}

function messageMentionsAgent(body: string, agentHandle: string): boolean {
  const escaped = agentHandle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[\\s(])@(?:${escaped}|agent)\\b`, 'i').test(body);
}

export async function postWorkChannelMessage(a: Access, channelId: string, input: unknown) {
  await authorize(a, 'work', undefined, true);
  if (a.api) fail(403, 'Human workspace session required for channel discussions');
  const d = workChannelMessageInput.parse(input);
  const channels = await ensureDefaultChannels(a);
  const channel = channels.find((c) => c.id === channelId || c.slug === channelId);
  if (!channel) return fail(404, 'Discussion channel not found');

  const [members, policy, existingMsgs] = await Promise.all([
    loadWorkspaceMembersWithAvatars(a.org),
    getAgentPolicy(a),
    all(a, 'work_channel_message'),
  ]);
  const memberById = new Map(members.map((m) => [m.id, m]));
  const author = memberById.get(a.actor);

  const channelHistory = existingMsgs
    .filter((m) => m.channel_id === channel.id)
    .sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)));

  if (d.reply_to && !channelHistory.some((m) => m.id === d.reply_to)) {
    fail(400, 'Reply target message not found in this channel');
  }

  // Detect @username mentions of workspace members in the body automatically
  const mentionedMemberIds = new Set<string>(d.mentions);
  for (const m of members) {
    const escapedUser = m.username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`@${escapedUser}\\b`, 'i').test(d.body)) {
      mentionedMemberIds.add(m.id);
    }
  }

  const savedUserMsg = await create(a, 'work_channel_message', {
    channel_id: channel.id,
    body: d.body,
    is_agent: false,
    author_id: a.actor,
    author_name: author?.display_name || 'Team member',
    author_username: author?.username || 'member',
    reply_to: d.reply_to,
    mentions: [...mentionedMemberIds],
    agent_run: null,
  });

  // Notify mentioned teammates in-app
  for (const uid of mentionedMemberIds) {
    if (uid === a.actor) continue;
    await notify(a, {
      category: 'work',
      title: `Mentioned in #${channel.name}`,
      body: `${author?.display_name || 'A teammate'} mentioned you in #${channel.name}: "${d.body.slice(0, 120)}"`,
      user_id: uid,
      resource_id: channel.id,
      key: `work-channel-mention:${savedUserMsg.id}:${uid}`,
      action_data: { app_id: 'work', section: 'discussions', record_id: channel.id },
    }).catch(() => {});
  }

  const byId = new Map<string, any>([
    ...channelHistory.map((m) => [m.id, m] as [string, any]),
    [savedUserMsg.id, savedUserMsg],
  ]);

  let agentReplyRow: any = null;

  // If the employee mentioned @<agent_handle> (e.g. @continua-agent), invoke Python Autonomous Agent!
  if (messageMentionsAgent(d.body, policy.agent_handle)) {
    try {
      const [snapshot, workList, calList, crmRows, customerRows] = await Promise.all([
        financialSnapshot(a, { currency: d.currency }).catch(() => null),
        workProjects(a).catch(() => ({ data: [] })),
        calendarEvents(a).catch(() => ({ data: [] })),
        dbAll(
          "SELECT id, kind, title, stage, status, amount_minor, currency FROM ac_crm_entries WHERE org_id=? AND environment=? AND status<>'archived'",
          [a.org, a.environment],
        ).catch(() => []),
        dbAll(
          "SELECT id FROM ac_records WHERE org_id=? AND environment=? AND kind='customers'",
          [a.org, a.environment],
        ).catch(() => []),
      ]);

      const projects = (workList.data || []).map((p: any) => ({
        id: p.id,
        name: p.data?.name || p.name,
        status: p.status,
        deadline: p.due_on || p.data?.deadline || null,
      }));
      const tasks = (workList.data || []).flatMap((p: any) =>
        (p.tasks || []).map((t: any) => ({
          id: t.id,
          title: t.data?.title || t.title,
          stage: t.stage,
          status: t.status,
          priority: t.data?.priority || 'normal',
        })),
      );
      const events = (calList.data || []).slice(0, 10).map((e: any) => ({
        id: e.id,
        title: e.data?.title || e.title,
        start: e.data?.start || e.start,
        timezone: e.data?.timezone || 'Africa/Nairobi',
        location: e.data?.location || '',
      }));

      const recentForPy = channelHistory.slice(-12).map((m) => ({
        author_name: m.is_agent
          ? policy.agent_display_name
          : memberById.get(String(m.author_id || ''))?.display_name || m.author_name || 'Member',
        is_agent: !!m.is_agent,
        body: String(m.body || '').slice(0, 400),
      }));

      const pyDecision = await runPythonAgent<{
        mode: 'delegate_action' | 'direct_reply';
        clean_prompt: string;
        reply_body: string;
      }>({
        op: 'handle_discussion_mention',
        message_body: d.body,
        agent_handle: policy.agent_handle,
        agent_display_name: policy.agent_display_name,
        channel_name: channel.name,
        author_name: author?.display_name || 'Team member',
        currency: d.currency,
        recent_messages: recentForPy,
        workspace_context: {
          totals: snapshot?.totals || {},
          period: snapshot?.period || {},
          invoices: snapshot?.invoices || [],
          expenses: snapshot?.inputs?.expenses || [],
          obligations: snapshot?.inputs?.obligations || [],
          crm_entries: crmRows,
          projects,
          tasks,
          calendar_events: events,
          customers: customerRows,
          members: members.map((m) => ({
            display_name: m.display_name,
            username: m.username,
            role: m.role,
          })),
        },
        consent_to_provider: false,
      });

      let replyText = pyDecision.reply_body;
      let runSummaryObj: Record<string, unknown> | null = null;

      if (pyDecision.mode === 'delegate_action' && pyDecision.clean_prompt) {
        try {
          const run = await runAgent(
            a,
            {
              prompt: pyDecision.clean_prompt,
              currency: d.currency,
              computer_use: true,
              stage_in_sandbox: false,
            },
            'channel-agent-' + randomUUID(),
          );
          replyText = run.summary;
          runSummaryObj = {
            run_id: run.id,
            status: run.status,
            tool_name: run.tool_name,
            approval_id: run.result?.approval_id || null,
            destination: run.result?.destination || null,
            credits_used: run.credits_used,
          };
        } catch (err) {
          replyText = `I couldn't execute that action right now: ${(err as Error).message}`;
        }
      }

      if (replyText) {
        agentReplyRow = await create(a, 'work_channel_message', {
          channel_id: channel.id,
          body: replyText,
          is_agent: true,
          author_id: 'agent',
          author_name: policy.agent_display_name,
          author_username: policy.agent_handle,
          reply_to: savedUserMsg.id,
          mentions: [a.actor],
          agent_run: runSummaryObj,
        });
        byId.set(agentReplyRow.id, agentReplyRow);
      }
    } catch (err) {
      agentReplyRow = await create(a, 'work_channel_message', {
        channel_id: channel.id,
        body: `I ran into an issue answering that mention: ${(err as Error).message}`,
        is_agent: true,
        author_id: 'agent',
        author_name: policy.agent_display_name,
        author_username: policy.agent_handle,
        reply_to: savedUserMsg.id,
        mentions: [a.actor],
        agent_run: null,
      });
      byId.set(agentReplyRow.id, agentReplyRow);
    }
  }

  return {
    message: formatChannelMessage(savedUserMsg, memberById, byId, policy),
    agent_reply: agentReplyRow
      ? formatChannelMessage(agentReplyRow, memberById, byId, policy)
      : null,
  };
}
