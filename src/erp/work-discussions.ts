import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { dbAll, dbGet } from '../db/adapter';
import { audit, fail, type Access } from '../platform/auth';
import { deriveUsername, getUserAvatarProfiles } from '../platform/profile-avatar';
import {
  getWorkspaceMemberOverrides,
  resolveWorkspaceUsernames,
} from '../platform/member-access';
import { all, create } from '../operations/store';
import { financialSnapshot } from '../operations/intelligence';
import { notify } from '../operations/automation';
import { authorize, insert, read, visible } from './store';
import { calendarEvents } from '../apps/phase3';
import { workProjects } from './work';
import { getAgentPolicy, runAgent } from '../agent/engine';
import { runPythonAgent } from '../agent/python-bridge';

export const workChannelCreateInput = z
  .object({
    name: z.string().trim().min(2).max(50),
    category: z.string().trim().min(2).max(32).default('DISCUSSIONS'),
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

async function loadWorkspaceMembersWithAvatars(orgId: string, agentHandle?: string) {
  const [rows, overrides] = await Promise.all([
    dbAll(
      'SELECT u.id, u.email, m.role, p.display_name FROM ac_memberships m JOIN ac_users u ON u.id=m.user_id LEFT JOIN ac_profiles p ON p.user_id=u.id WHERE m.org_id=? ORDER BY u.email',
      [orgId],
    ),
    getWorkspaceMemberOverrides(orgId),
  ]);
  const avatarMap = await getUserAvatarProfiles(rows.map((r: any) => String(r.id)));
  const usernameMap = resolveWorkspaceUsernames(
    rows.map((r: any) => ({
      id: String(r.id),
      email: String(r.email || ''),
      display_name: String(r.display_name || ''),
    })),
    overrides,
    avatarMap,
    agentHandle,
  );
  return rows.map((r: any) => {
    const uid = String(r.id);
    const extra = avatarMap.get(uid);
    const displayName = String(r.display_name || r.email?.split('@')[0] || 'Member');
    return {
      id: uid,
      email: String(r.email || ''),
      role: String(r.role || 'member'),
      display_name: displayName,
      username: usernameMap.get(uid) || deriveUsername(displayName, r.email),
      avatar_url: extra?.avatar_url || '',
    };
  });
}

async function buildProjectChannels(a: Access, countsByChannel: Map<string, number>) {
  const projects = await visible(a, 'work_project');
  const projectIds = projects.slice(0, 100).map((p) => p.id);
  const erpMsgCounts = projectIds.length
    ? await dbAll(
        "SELECT root_id, COUNT(*) AS total FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='work_message' AND root_id IN (" +
          projectIds.map(() => '?').join(',') +
          ') GROUP BY root_id',
        [a.org, a.environment, ...projectIds],
      )
    : [];
  const erpCountMap = new Map(erpMsgCounts.map((r: any) => [String(r.root_id), Number(r.total || 0)]));

  return projects.slice(0, 100).map((p, idx) => {
    const cid = 'project:' + p.id;
    const slug = slugifyChannel(p.data?.name || 'project');
    const totalCount = (erpCountMap.get(p.id) || 0) + (countsByChannel.get(cid) || 0);
    return {
      id: cid,
      project_id: p.id,
      slug,
      name: slug,
      category: 'PROJECTS',
      topic: p.data?.description || `Project channel for ${p.data?.name || 'Work project'}.`,
      icon: 'grid',
      message_count: totalCount,
      position: 100 + idx,
      created_at: p.created_at,
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

  const projectChannels = await buildProjectChannels(a, countsByChannel);

  const sortedChannels = [...channels]
    .sort(
      (x, y) =>
        Number(x.position || 99) - Number(y.position || 99) ||
        String(x.created_at).localeCompare(String(y.created_at)),
    )
    .map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      category: c.category || 'DISCUSSIONS',
      topic: c.topic || '',
      icon: c.icon || 'hash',
      message_count: countsByChannel.get(c.id) || 0,
      created_at: c.created_at,
    }))
    .concat(projectChannels);

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
    return fail(409, `Channel #${slug} already exists in this workspace`);
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

async function resolveChannelOrProject(a: Access, channelId: string) {
  if (channelId.startsWith('project:')) {
    const projectId = channelId.slice('project:'.length);
    const p = await read(a, projectId, 'work_project');
    await authorize(a, 'work', p.id);
    const slug = slugifyChannel(p.data?.name || 'project');
    return {
      id: 'project:' + p.id,
      project_id: p.id,
      project_obj: p,
      slug,
      name: slug,
      category: 'PROJECTS',
      topic: p.data?.description || `Project discussion channel for ${p.data?.name || 'project'}.`,
      icon: 'grid',
    };
  }
  const channels = await ensureDefaultChannels(a);
  const found = channels.find((c) => c.id === channelId || c.slug === channelId);
  if (!found) return null;
  return {
    id: found.id,
    project_id: null as string | null,
    project_obj: null as any,
    slug: found.slug,
    name: found.name,
    category: found.category,
    topic: found.topic,
    icon: found.icon,
  };
}

async function loadCombinedChannelHistory(a: Access, resolved: NonNullable<Awaited<ReturnType<typeof resolveChannelOrProject>>>) {
  const allChannelMsgs = (await all(a, 'work_channel_message')).filter(
    (m) => m.channel_id === resolved.id,
  );
  if (!resolved.project_id) {
    return allChannelMsgs.sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)));
  }

  // Merge legacy/canonical project `work_message` records seamlessly into the Discord stream!
  const erpMsgs = await visible(a, 'work_message', resolved.project_id, 0);
  const converted = erpMsgs.map((em) => ({
    id: em.id,
    channel_id: resolved.id,
    body: String(em.data?.body || ''),
    is_agent: false,
    author_id: String(em.data?.author_id || em.owner_id || ''),
    author_name: '',
    author_username: '',
    reply_to: em.data?.reply_to || null,
    mentions: Array.isArray(em.data?.mentions) ? em.data.mentions : [],
    agent_run: null,
    created_at: em.created_at,
  }));

  return [...converted, ...allChannelMsgs].sort((x, y) =>
    String(x.created_at).localeCompare(String(y.created_at)),
  );
}

export async function listWorkChannelMessages(a: Access, channelId: string) {
  await authorize(a, 'work');
  const channel = await resolveChannelOrProject(a, channelId);
  if (!channel) return fail(404, 'Discussion channel not found');

  const [channelMsgsRaw, members, policy] = await Promise.all([
    loadCombinedChannelHistory(a, channel),
    loadWorkspaceMembersWithAvatars(a.org),
    getAgentPolicy(a),
  ]);

  const memberById = new Map(members.map((m) => [m.id, m]));
  const channelMsgs = channelMsgsRaw.slice(-150);
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
  if (a.api) return fail(403, 'Human workspace session required for channel discussions');
  const d = workChannelMessageInput.parse(input);
  const channel = await resolveChannelOrProject(a, channelId);
  if (!channel) return fail(404, 'Discussion channel not found');

  if (channel.project_id) {
    await authorize(a, 'work', channel.project_id, true);
  }

  const [members, policy, channelHistory] = await Promise.all([
    loadWorkspaceMembersWithAvatars(a.org),
    getAgentPolicy(a),
    loadCombinedChannelHistory(a, channel),
  ]);
  const memberById = new Map(members.map((m) => [m.id, m]));
  const author = memberById.get(a.actor);

  if (d.reply_to && !channelHistory.some((m) => m.id === d.reply_to)) {
    return fail(400, 'Reply target message not found in this channel');
  }

  const mentionedMemberIds = new Set<string>(d.mentions);
  for (const m of members) {
    const escapedUser = m.username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`@${escapedUser}\\b`, 'i').test(d.body)) {
      mentionedMemberIds.add(m.id);
    }
  }

  // If inside a project channel and NOT replying to an agent-only message, also persist as canonical work_message!
  let savedUserMsg: any;
  const replyTarget = d.reply_to ? channelHistory.find((m) => m.id === d.reply_to) : null;
  if (channel.project_id && (!replyTarget || !replyTarget.is_agent)) {
    const validProjMentions = [...mentionedMemberIds].filter((uid) =>
      (channel.project_obj?.data?.members || []).some((pm: any) => pm.user_id === uid),
    );
    const erpMsg = await insert(
      a,
      'work_message',
      {
        body: d.body,
        task_id: null,
        reply_to: d.reply_to,
        mentions: validProjMentions,
        author_id: a.actor,
      },
      { root: channel.project_id, parent: d.reply_to },
    );
    savedUserMsg = {
      id: erpMsg.id,
      channel_id: channel.id,
      body: d.body,
      is_agent: false,
      author_id: a.actor,
      author_name: author?.display_name || 'Team member',
      author_username: author?.username || 'member',
      reply_to: d.reply_to,
      mentions: [...mentionedMemberIds],
      agent_run: null,
      created_at: erpMsg.created_at,
    };
  } else {
    savedUserMsg = await create(a, 'work_channel_message', {
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
  }

  for (const uid of mentionedMemberIds) {
    if (uid === a.actor) continue;
    await notify(a, {
      category: 'work',
      title: `Mentioned in #${channel.name}`,
      body: `${author?.display_name || 'A teammate'} mentioned you in #${channel.name}: "${d.body.slice(0, 120)}"`,
      user_id: uid,
      resource_id: channel.project_id || channel.id,
      key: `work-channel-mention:${savedUserMsg.id}:${uid}`,
      action_data: { app_id: 'work', section: 'discussions', record_id: channel.project_id || channel.id },
    }).catch(() => {});
  }

  const byId = new Map<string, any>([
    ...channelHistory.map((m) => [m.id, m] as [string, any]),
    [savedUserMsg.id, savedUserMsg],
  ]);

  let agentReplyRow: any = null;

  if (messageMentionsAgent(d.body, policy.agent_handle)) {
    try {
      const [snapshot, workList, calList, rawCrmRows, customerRowsRaw, productRowsRaw, quoteRowsRaw, orderRowsRaw, allAgentRuns] = await Promise.all([
        financialSnapshot(a, { currency: d.currency }).catch(() => null),
        workProjects(a).catch(() => ({ data: [] })),
        calendarEvents(a).catch(() => ({ data: [] })),
        dbAll(
          "SELECT id, kind, status, data FROM ac_crm_entries WHERE org_id=? AND environment=? AND status<>'archived'",
          [a.org, a.environment],
        ).catch(() => []),
        dbAll(
          "SELECT id, data FROM ac_records WHERE org_id=? AND environment=? AND kind='customers'",
          [a.org, a.environment],
        ).catch(() => []),
        dbAll(
          "SELECT id FROM ac_records WHERE org_id=? AND environment=? AND kind='products'",
          [a.org, a.environment],
        ).catch(() => []),
        dbAll(
          "SELECT id FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='sales_quotation'",
          [a.org, a.environment],
        ).catch(() => []),
        dbAll(
          "SELECT id FROM ac_records WHERE org_id=? AND environment=? AND kind='orders'",
          [a.org, a.environment],
        ).catch(() => []),
        all(a, 'agent_run').catch(() => []),
      ]);
      const customerRows = customerRowsRaw.map((c: any) => {
        try {
          const parsed = JSON.parse(c.data || '{}');
          return { id: c.id, name: parsed.name || parsed.company_name || '' };
        } catch {
          return { id: c.id, name: '' };
        }
      });
      const actorLatestRun = allAgentRuns
        .filter((r: any) => r.actor === a.actor)
        .sort((x: any, y: any) => String(y.created_at).localeCompare(String(x.created_at)))[0];
      const hasPendingIntent = !!(
        actorLatestRun &&
        actorLatestRun.status === 'needs_input' &&
        actorLatestRun.result?.pending_intent &&
        Date.now() - Date.parse(String(actorLatestRun.created_at || '')) < 30 * 60_000
      );

      const crmRows = rawCrmRows.map((r: any) => {
        let parsed: any = {};
        try {
          parsed = JSON.parse(r.data || '{}');
        } catch {
          /* ignore */
        }
        return {
          id: r.id,
          kind: r.kind,
          status: r.status,
          title: parsed.title || 'Lead',
          stage: parsed.stage || 'new',
          amount_minor: Number(parsed.amount_minor || 0),
          currency: parsed.currency || d.currency,
        };
      });

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
        has_pending_intent: hasPendingIntent,
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
          products: productRowsRaw,
          quotations: quoteRowsRaw,
          orders: orderRowsRaw,
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
            { source: 'work_discussion' },
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
