/* Pure annual-response adapter. Never fetches, logs, persists, or synthesizes user content. */
(function (root) {
  'use strict';
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const list = value => Array.isArray(value) ? value : [];
  const text = value => typeof value === 'string' && value.trim() ? value.trim() : null;
  const flag = value => value === true || value === 1 || value === 'true';
  const boolean = value => typeof value === 'boolean' ? value : null;
  const count = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
  const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  const id = value => {
    const result = text(value);
    return result && result.length <= 256 && !/[\u0000-\u001f\u007f]/.test(result) && !['__proto__', 'prototype', 'constructor'].includes(result) ? result : null;
  };
  const date = value => {
    const result = text(value);
    return result && /^\d{4}-\d{2}-\d{2}(?:T[^\s]+)?$/.test(result) ? result : null;
  };
  const language = value => typeof value === 'string' && /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*$/.test(value) ? value : null;
  const first = (...values) => values.find(value => value !== null && value !== undefined) ?? null;
  const STATUSES = new Set(['ready', 'partial', 'not_built', 'unavailable', 'pending', 'withheld', 'insufficient_source']);
  const statusOf = value => STATUSES.has(record(value).status) ? value.status : 'unknown';
  const usable = value => ['ready', 'partial'].includes(statusOf(value));
  const ids = value => [...new Set(list(value).map(id).filter(Boolean))];
  const NAMES = Object.freeze({ romance: '心动星系', fantasy: '奇幻星系', dark: '永夜星系', scifi: '星际星系', sci_fi: '星际星系', science_fiction: '星际星系', adventure: '冒险星系', healing: '治愈星系', daily: '日常星系', daily_life: '日常星系', slice_of_life: '日常星系', anime: '动漫星系', game: '游戏星系', gaming: '游戏星系', horror: '惊悚星系', mystery: '悬疑星系', historical: '历史星系', school: '校园星系', campus: '校园星系', drama: '戏剧星系', crime: '迷案星系', hero: '英雄星系', unknown: '未知星云' });
  const THEME = Object.freeze({ romance: 1, daily: 1, daily_life: 1, slice_of_life: 1, school: 1, campus: 1, drama: 1, fantasy: 2, adventure: 2, healing: 2, anime: 2, game: 2, gaming: 2, hero: 2, dark: 0, horror: 0, mystery: 0, historical: 0, crime: 0, scifi: 3, sci_fi: 3, science_fiction: 3 });
  const COLORS = ['#b582b7', '#f2a5b9', '#a5a0ed', '#77cad4'];
  const MUSIC = ['dark', 'romance', 'fantasy', 'scifi'];

  class AnnualDataError extends Error {
    constructor(status) {
      super(status === 'not_built' ? '年度回忆尚未准备完成。' : '年度回忆暂时不可用。');
      this.name = 'AnnualDataError'; this.status = status; this.code = status;
    }
  }

  function safeURL(value) {
    const raw = text(value);
    if (!raw || /[\u0000-\u0020\u007f\\]/.test(raw)) return null;
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:' || url.username || url.password || !url.hostname) return null;
      return url.href;
    } catch { return null; }
  }
  function safeAudioURL(value) {
    const raw = text(value);
    // These relative routes require authenticated same-origin proxy/blob fetches.
    return raw && /^\/v1\/audio\/[A-Za-z0-9_-]+$/.test(raw) ? raw : null;
  }
  function numbers(source, keys) {
    const data = record(source);
    return Object.fromEntries(keys.map(key => [key, count(data[key])]));
  }
  function safeSources(value, sourceField, kind = 'ai_summary') {
    const item = record(value);
    return { kind, source: text(item.source), sourceField, grounded: boolean(item.grounded), arcId: id(item.arc_id), messageIds: ids(item.message_ids), contextIds: ids(item.context_ids) };
  }
  function quote(value, sourceField) {
    const item = record(value), content = text(item.text) ? item.text : null, messageId = id(item.message_id);
    const speaker = item.speaker === 'bot' || item.role === 'assistant' || item.role === 'bot' ? 'bot' : item.speaker === 'user' || item.role === 'user' ? 'user' : null;
    if (!content || !messageId || !speaker) return null;
    return { text: content, speaker, day: date(item.day), messageId, kind: 'historical_quote', source: 'messages', sourceField };
  }
  function baseBlocked(...values) {
    return values.some(value => {
      const item = record(value);
      return ['deleted', 'minor', 'is_minor_bot', 'hidden', 'story_blocked'].some(key => flag(item[key])) || [item.moderation, item.audit_moderation].some(value => String(value || '').toUpperCase() === 'ILLEGAL');
    });
  }
  function unsafeInSafeMode(...values) {
    return values.some(value => {
      const item = record(value), moderations = [item.moderation, item.audit_moderation].map(value => String(value || '').toUpperCase());
      return flag(item.nsfw) || moderations.some(value => value && value !== 'SFW');
    });
  }

  function normalize(input = {}) {
    const annual = record(input.annual);
    if (!usable(annual)) {
      const status = annual.code === 'not_built' ? 'not_built' : STATUSES.has(annual.status) ? annual.status : ['unauthorized', 'forbidden_region', 'not_found'].includes(annual.code) ? annual.code : 'invalid_response';
      throw new AnnualDataError(status);
    }
    const profile = usable(input.profile) ? record(input.profile) : {};
    const summary = usable(input.summary) ? record(input.summary) : {};
    const content = usable(input.content) ? record(input.content) : {};
    const call = usable(input.call) ? record(input.call) : {};
    const safeMode = flag(annual.safe_mode), safety = record(record(annual.safety).bots);
    const hidden = new Set(ids(record(annual.state).hidden_bots));
    const fullBots = new Map();
    for (const item of list(annual.bots)) {
      const key = id(record(item).bot_id);
      if (!key) continue;
      const existing = fullBots.get(key);
      if (!existing || baseBlocked(item)) fullBots.set(key, record(item));
    }
    const minorContent = new Set();
    for (const item of [...list(content.arc_cards), ...list(content.planet_plots), ...list(content.next_stop_recaps), ...list(content.postcard_lines)]) {
      if (['minor_content', 'minor_character', 'minor_signal', 'minor_sexual'].includes(record(item).reason)) {
        const key = id(item.bot_id); if (key) minorContent.add(key);
      }
    }
    const allowed = (key, candidate) => key && !hidden.has(key) && !minorContent.has(key) && !baseBlocked(candidate, fullBots.get(key), own(safety, key) ? safety[key] : null) && (!safeMode || !unsafeInSafeMode(candidate, fullBots.get(key), own(safety, key) ? safety[key] : null));
    const roleMap = new Map();
    for (const role of (annual.role_boxes_status == null || ['ready', 'partial'].includes(annual.role_boxes_status)) ? list(annual.role_boxes) : []) {
      const key = id(record(record(role).bot).bot_id);
      if (key && allowed(key, role.bot)) roleMap.set(key, record(role));
    }
    const arcs = new Map();
    for (const arc of list(annual.arcs)) if (record(arc).safety_status === 'passed' && id(arc.arc_id) && allowed(id(arc.bot_id), arc.bot)) arcs.set(arc.arc_id, arc);
    const readyArcCards = new Set(list(content.arc_cards).filter(raw => {
      const card = record(raw), arc = arcs.get(card.arc_id);
      return card.status === 'ready' && card.grounded !== false && card.source === 'messages' && arc && id(arc.bot_id) === id(card.bot_id);
    }).map(card => card.arc_id));

    function storyData(key, canShow) {
      const stories = [], quotes = [];
      if (!canShow) return { stories, quotes };
      for (const [field, valueKey] of [['planet_plots', 'plot'], ['next_stop_recaps', 'recap']]) {
        for (const raw of list(content[field])) {
          const item = record(raw);
          if (id(item.bot_id) !== key || item.status !== 'ready' || item.grounded !== true || !['messages', 'story_context', 'arc_card'].includes(item.source)) continue;
          if (item.source === 'arc_card' && (!readyArcCards.has(item.arc_id) || id(arcs.get(item.arc_id).bot_id) !== key)) continue;
          const value = text(item[valueKey]);
          if (value) stories.push({ text: value, title: null, day: date(record(item.act).day), ...safeSources(item, `annual.content.${field}`) });
          for (const rawQuote of list(item.quotes)) { const q = quote(rawQuote, `annual.content.${field}.quotes`); if (q) quotes.push(q); }
        }
      }
      for (const raw of list(content.arc_cards)) {
        const card = record(raw), arc = arcs.get(card.arc_id);
        if (id(card.bot_id) !== key || card.status !== 'ready' || card.grounded === false || card.source !== 'messages' || !arc || id(arc.bot_id) !== key) continue;
        for (const rawAct of list(card.acts)) {
          const act = record(rawAct), value = text(act.line);
          if (value) stories.push({ text: value, title: text(act.name) || text(card.title), day: date(act.day), kind: 'ai_summary', source: 'messages', sourceField: 'annual.content.arc_cards.acts', grounded: true, arcId: id(card.arc_id), messageIds: ids(act.message_ids), contextIds: [] });
        }
        for (const rawQuote of list(card.quotes)) { const q = quote(rawQuote, 'annual.content.arc_cards.quotes'); if (q) quotes.push(q); }
      }
      for (const raw of list(content.postcard_lines)) {
        const item = record(raw);
        if (id(item.bot_id) !== key || item.status !== 'ready') continue;
        const q = quote(item.line, 'annual.content.postcard_lines.line'); if (q) quotes.push(q);
      }
      const seenStories = new Set(), seenQuotes = new Set();
      return {
        stories: stories.filter(item => { if (seenStories.has(item.text)) return false; seenStories.add(item.text); return true; }),
        quotes: quotes.filter(item => { const signature = item.messageId + '\n' + item.text; if (seenQuotes.has(signature)) return false; seenQuotes.add(signature); return true; })
      };
    }

    function fragmentStats(scene, bot, box) {
      if (scene === 'landing_day') return { firstMet: bot.firstMet, firstDay: bot.firstDay, day: date(box.day), sends: bot.messages };
      if (scene === 'brightest_day') return { day: date(record(annual.brightest).day), sends: count(record(annual.brightest).sends) };
      if (scene === 'longest_voyage') return { start: date(record(annual.streak).start), end: date(record(annual.streak).end), ...numbers(annual.streak, ['days', 'sends']) };
      if (scene === 'directors_cut') return { ...numbers(annual.director, ['regenerates', 'edit', 'resend', 'continue', 'auto_reply']), share: number(record(annual.director).share) };
      if (scene === 'night_flight') {
        const night = record(record(annual.night).scene);
        if (!usable(night)) return null;
        return { status: night.status, start: date(night.start), cutoff: date(night.cutoff), ...numbers(night, ['sends', 'night_days', 'active_days', 'unknown_sends']), peakHours: list(night.peak_hours).filter(value => Number.isInteger(value) && value >= 0 && value <= 23) };
      }
      if (scene === 'star_maker') return { ...numbers(annual.creator_usage, ['sends', 'users', 'conversations']), start: date(record(annual.creator_usage).start), cutoff: date(record(annual.creator_usage).cutoff) };
      return null;
    }

    const seenBots = new Set();
    function normalizeBot(candidate, galaxyKey) {
      const item = record(candidate), key = id(item.bot_id);
      if (!allowed(key, item) || seenBots.has(key)) return null;
      seenBots.add(key);
      const full = fullBots.get(key) || {}, role = roleMap.get(key) || {};
      const canShowStory = !safeMode && item.story_ok !== false && full.story_ok !== false;
      const { stories, quotes } = storyData(key, canShowStory);
      const selectedQuote = quotes.find(value => value.speaker === 'bot');
      const selectedStory = stories[0];
      const bot = {
        id: key, uid: `${galaxyKey}:${key}`, name: first(text(item.title), text(full.title), text(item.nickname), text(full.nickname)),
        title: first(text(item.nickname), text(full.nickname)), portraitUrl: first(safeURL(item.avatar), safeURL(full.avatar)),
        coverUrl: canShowStory && item.cover_ok !== false && full.cover_ok !== false ? first(safeURL(item.cover), safeURL(full.cover), safeURL(role.cover)) : null,
        days: first(count(item.active_days), count(full.active_days)), messages: first(count(item.sends), count(full.sends)),
        firstMet: date(full.first_met_day), firstDay: first(date(item.first_day), date(full.first_day), date(role.first_day)),
        quote: selectedQuote?.text || selectedStory?.text || null,
        quoteKind: selectedQuote ? 'historical_quote' : selectedStory ? 'ai_summary' : null,
        quoteSource: selectedQuote || selectedStory ? { ...(selectedQuote || selectedStory), text: undefined } : null,
        letter: stories.map(value => value.text), letterSources: stories.map(({ text: _, ...source }) => source), stories, quotes,
        images: [], boxes: [], callSegments: [], voice: null, allowPrivateTTS: false, contentAllowed: canShowStory,
        has_arc: item.has_arc === true || full.has_arc === true, tier: first(text(item.tier), text(full.tier)),
        boxTotal: first(count(item.box_total), null), boxOpened: first(count(item.box_opened), null),
        memoryTitle: null, memoryCaption: null, memoryDate: null, date: null,
        source: 'annual.galaxy_bots', sourceGalaxy: galaxyKey
      };
      for (const raw of list(role.boxes)) {
        const box = record(raw);
        if (id(box.bot_id) && id(box.bot_id) !== key) continue;
        const form = ['fragment', 'image', 'call', 'postcard'].includes(box.form) ? box.form : null;
        if (!form || !id(box.id) || baseBlocked(box)) continue;
        const image = record(box.image), imageURL = canShowStory && box.status === 'available' && form === 'image' && !baseBlocked(image) && (image.status == null || ['available', 'ready'].includes(image.status)) ? safeURL(image.image_url) : null;
        const stats = form === 'fragment' && box.status === 'available' ? fragmentStats(box.scene, bot, box) : null;
        const titles = { landing_day: '降落日', brightest_day: '最亮的一天', longest_voyage: '最长航程', night_flight: '深夜航班', directors_cut: '导演剪辑', star_maker: '造星者', frozen_frame: '定格的一帧', call: '年度来电', postcard: '星球明信片' };
        const pieces = [];
        if (stats) {
          if (stats.firstMet) pieces.push(`首次相遇：${stats.firstMet.slice(0, 10)}`);
          else if (stats.firstDay) pieces.push(`本年度首次聊天：${stats.firstDay.slice(0, 10)}`);
          else if (stats.day) pieces.push(`日期：${stats.day.slice(0, 10)}`);
          if (stats.start && stats.end) pieces.push(`${stats.start.slice(0, 10)} 至 ${stats.end.slice(0, 10)}`);
          for (const [key, label, unit] of [['days', '连续聊天', '天'], ['sends', '发送', '条消息'], ['night_days', '深夜聊天', '天'], ['regenerates', '重写', '次'], ['edit', '改写', '次'], ['users', '其他使用者', '人']]) if (stats[key] !== null && stats[key] !== undefined) pieces.push(`${label} ${stats[key]} ${unit}`);
        }
        const normalized = { id: id(box.id), botId: key, form, scene: text(box.scene), title: titles[box.scene] || '回忆片段', titleSource: 'frontend', text: pieces.length ? pieces.join(' · ') : null, description: pieces.length ? pieces.join(' · ') : null, status: box.status === 'available' ? 'available' : 'unavailable', available: box.status === 'available' && (form === 'fragment' ? Boolean(stats) : Boolean(canShowStory && (form !== 'image' || imageURL))), opened: boolean(box.opened), day: date(box.day), basis: text(box.basis), stats, source: 'annual.role_boxes' };
        if (imageURL) {
          const asset = { url: imageURL, imageUrl: imageURL, boxId: normalized.id, day: normalized.day, source: 'annual.role_boxes.box.image', kind: 'historical_image' };
          bot.images.push(asset); normalized.imageUrl = imageURL;
        }
        bot.boxes.push(normalized);
      }
      if (bot.images.length) bot.imageUrl = bot.images[0].url;
      bot.memoryDate = first(bot.images[0]?.day, stories.find(value => value.day)?.day, quotes.find(value => value.day)?.day);
      bot.date = bot.memoryDate ? bot.memoryDate.slice(5, 10).replace('-', '.') : null;
      bot.memoryTitle = stories.find(value => value.title)?.title || null;
      return bot;
    }

    const galaxyRows = [], seenGalaxies = new Set(), buckets = record(annual.galaxy_bots);
    for (const raw of [...list(annual.galaxies), ...(annual.unknown_galaxy ? [{ ...record(annual.unknown_galaxy), key: 'unknown' }] : [])]) {
      const item = record(raw), key = id(item.key);
      if (!key || seenGalaxies.has(key)) continue;
      seenGalaxies.add(key);
      const bucket = own(buckets, key) ? record(buckets[key]) : {}, name = text(item.name), themeIndex = own(THEME, key) ? THEME[key] : 3;
      galaxyRows.push({
        id: key, key, name: name || NAMES[key] || '未命名星系', nameSource: name ? 'api' : 'frontend',
        tag: name || NAMES[key] || '未分类', english: key.toUpperCase(), color: COLORS[themeIndex],
        description: null, lit: boolean(item.lit), guide: boolean(item.guide), count: count(item.chatted), sends: count(item.sends), words: null,
        more: count(bucket.more), ...numbers(item, ['landed', 'planets', 'residents', 'asteroids', 'stardust', 'box_total', 'box_opened']),
        themeIndex, themeSource: 'frontend', backgroundKind: 'theme_art', musicScene: key === 'unknown' ? 'galaxy' : MUSIC[themeIndex],
        bots: list(bucket.bots).map(bot => normalizeBot(bot, key)).filter(Boolean)
      });
    }

    const caller = record(call.caller), callerId = id(caller.bot_id), annualCaller = id(record(record(annual.call).bot).bot_id);
    const visibleBots = galaxyRows.flatMap(galaxy => galaxy.bots), matches = visibleBots.filter(bot => bot.id === callerId);
    const callAllowed = !safeMode && usable(call) && callerId && callerId === annualCaller && ['main', 'return', 'unfinished'].includes(record(annual.call).kind) && matches.length === 1 && matches[0].contentAllowed && !baseBlocked(caller, record(annual.call).bot);
    if (callAllowed) {
      const bot = matches[0];
      const append = (kind, content, audio, source) => { const value = text(content); if (value) bot.callSegments.push({ kind, text: value, audioUrl: safeAudioURL(audio), source }); };
      append('greeting', call.greeting, call.greeting_audio_url, 'annual.call.greeting');
      for (const raw of list(call.lines)) {
        const line = record(raw);
        if (['withheld', 'unavailable', 'pending'].includes(line.status) || baseBlocked(line)) continue;
        append('line', line.text, line.audio_url, 'annual.call.lines');
      }
      append('closing', call.closing, call.closing_audio_url, 'annual.call.closing');
      bot.voice = bot.callSegments.map(segment => segment.text).join('\n\n') || null;
      bot.callStatus = call.status;
      bot.callSource = 'annual.call';
    }
    for (const bot of visibleBots) for (const box of bot.boxes) if (box.form === 'call') box.available = box.available && bot.callSegments.length > 0;

    const metrics = record(annual.metrics), chars = count(annual.co_written_chars), summaryChars = count(record(summary.text).chars);
    const words = first(chars, summaryChars), wordsSource = chars !== null ? 'annual.co_written_chars' : summaryChars !== null ? 'summary.text.chars' : null;
    const period = text(annual.period), start = date(annual.start), yearText = period && /^\d{4}(?:-\d{2})?$/.test(period) ? period.slice(0, 4) : start?.slice(0, 4);
    const output = {
      demo: false, status: annual.status, year: yearText ? Number(yearText) : null, period: period || yearText || null,
      start, cutoff: date(annual.cutoff), edition: ['long', 'short'].includes(annual.edition) ? annual.edition : null,
      safeMode, safe_mode: safeMode, allowPrivateTTS: false,
      contentSource: text(annual.content_source), contentSince: date(annual.content_since),
      user: { name: text(profile.name), portraitUrl: safeURL(profile.avatar), days: first(count(metrics.active_days), count(summary.active_days)), words, botCount: first(count(metrics.bots_chatted), count(summary.bots_chatted)), sends: first(count(metrics.sends), count(summary.chats)), wordsEstimated: wordsSource === 'annual.co_written_chars' ? boolean(annual.co_written_chars_estimated) : boolean(record(summary.text).estimated), wordsBasis: wordsSource === 'annual.co_written_chars' ? text(annual.co_written_chars_basis) : text(record(summary.text).basis), wordsSource },
      metrics: { ...numbers(metrics, ['active_days', 'sends', 'bots_chatted', 'clean_bots', 'landed', 'planets', 'residents', 'asteroids', 'stardust', 'longest_streak_days']), top_share: number(metrics.top_share), switch_speed: number(metrics.switch_speed), recently_active: boolean(metrics.recently_active) },
      sourceStatuses: { annual: statusOf(annual), profile: statusOf(input.profile), summary: statusOf(input.summary), content: statusOf(input.content), call: statusOf(input.call) },
      roleBoxesStatus: statusOf({ status: annual.role_boxes_status }), boxesLocked: boolean(annual.role_boxes_locked), galaxies: galaxyRows
    };
    const poem = record(content.year_poem);
    if (!safeMode && poem.status === 'ready' && list(poem.lines).some(value => text(value))) output.yearPoem = { lines: list(poem.lines).map(text).filter(Boolean), language: language(poem.language), kind: 'ai_summary', source: 'annual.content.year_poem' };
    return output;
  }

  root.StellarAnnual = Object.freeze({ normalize, safeURL, safeAudioURL, AnnualDataError });
})(typeof window === 'undefined' ? globalThis : window);
