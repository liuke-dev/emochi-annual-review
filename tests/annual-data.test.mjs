import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

// Every value below is a fabricated fixture, never an API capture or document example.
const moduleURL = ['../server/annual-data.js', '../public/annual-data.js', '../dist/annual-data.js']
  .map(path => new URL(path, import.meta.url)).find(url => existsSync(url));
assert.ok(moduleURL, 'The annual-data adapter must exist in a supported source location');
const context = { URL }; vm.createContext(context);
vm.runInContext(readFileSync(moduleURL, 'utf8'), context);
const { normalize, safeURL, safeAudioURL, AnnualDataError } = context.StellarAnnual;
const plain = value => JSON.parse(JSON.stringify(value));
const botsOf = result => result.galaxies.flatMap(galaxy => galaxy.bots);

function fixture() {
  const keys = ['romance', 'fantasy', 'scifi', 'horror', 'adventure', 'daily', 'drama', 'crime', 'hero'];
  const role = { bot_id: 'fixture-role-alpha', title: '专用测试角色甲', avatar: 'https://media.example/fixture-avatar.png', galaxy: 'romance', moderation: 'SFW', nsfw: false, deleted: false, hidden: false, minor: false, story_blocked: false, story_ok: true, cover_ok: true, cover: 'https://media.example/fixture-cover.png', sends: 51, active_days: 7, first_met_day: '2031-12-07', first_day: '2032-01-09' };
  return {
    annual: {
      status: 'ready', period: '2032', start: '2032-01-01', cutoff: '2032-11-02', edition: 'long', safe_mode: false,
      metrics: { active_days: 7, sends: 51, bots_chatted: 12 },
      co_written_chars: 4321, co_written_chars_estimated: true, co_written_chars_basis: 'fabricated_fixture_estimate',
      galaxies: keys.map((key, index) => ({ key, chatted: index ? 0 : 3, sends: index ? 0 : 51, lit: !index, guide: !index })),
      unknown_galaxy: { key: 'unknown', chatted: 0, lit: false, guide: false },
      galaxy_bots: { romance: { bots: [{ bot_id: role.bot_id, title: role.title, avatar: role.avatar, sends: 51, active_days: 7, first_day: role.first_day }], more: 2 } },
      bots: [role], state: { hidden_bots: [] }, safety: { bots: {} },
      role_boxes_status: 'ready', role_boxes: [{ bot: { bot_id: role.bot_id }, cover: role.cover, boxes: [
        { id: 'fixture-box-day', bot_id: role.bot_id, form: 'fragment', scene: 'landing_day', status: 'available', opened: false, day: role.first_day },
        { id: 'fixture-box-image', bot_id: role.bot_id, form: 'image', scene: 'frozen_frame', status: 'available', day: '2032-04-03', image: { image_url: 'https://media.example/fixture-memory.png' } },
        { id: 'fixture-box-call', bot_id: role.bot_id, form: 'call', scene: 'call', status: 'available' }
      ] }],
      arcs: [{ arc_id: 'fixture-arc-a', bot_id: role.bot_id, safety_status: 'passed' }],
      call: { kind: 'main', bot: { bot_id: role.bot_id } }
    },
    profile: { status: 'ready', name: '专用测试旅人', avatar: 'https://media.example/fixture-user.png' },
    summary: { status: 'ready', active_days: 9, bots_chatted: 15, chats: 72, text: { chars: 9876 } },
    content: { status: 'ready', planet_plots: [{ status: 'ready', bot_id: role.bot_id, grounded: true, source: 'messages', plot: '这是专门编写的虚构摘要。', message_ids: ['fixture-message-a'], quotes: [
      { message_id: 'fixture-message-a', role: 'user', text: '  这句是测试用户原话。  ' },
      { message_id: 'fixture-message-b', role: 'assistant', text: '这句是测试角色原话。' }
    ] }], arc_cards: [{ arc_id: 'fixture-arc-a', bot_id: role.bot_id, status: 'ready', source: 'messages', title: '测试剧情', acts: [{ name: '测试一幕', day: '2032-03-02', line: '这是专门编写的虚构幕概述。', message_ids: ['fixture-message-c'], subject: 'bot' }], quotes: [] }], next_stop_recaps: [], postcard_lines: [], year_poem: { status: 'ready', lines: ['一行虚构的测试诗句'], language: 'zh' } },
    call: { status: 'ready', caller: { bot_id: role.bot_id, name: '这不是身份回填来源' }, greeting: '测试接通语。', greeting_audio_url: '/v1/audio/fixture-greeting', lines: [{ text: '测试来电正文。', audio_url: '/v1/audio/fixture-body', evidence: [{ content: 'DO_NOT_FORWARD_RAW_EVIDENCE', conversation_id: 'fixture-private-context' }] }], closing: '测试结束语。', closing_audio_url: '/v1/audio/fixture-closing' }
  };
}

test('rejects unavailable main data with typed errors and no raw response attached', () => {
  for (const status of ['not_built', 'unavailable', 'pending', 'withheld']) {
    assert.throws(() => normalize({ annual: { status, secret: 'DO_NOT_COPY_ERROR_PAYLOAD' } }), error => {
      assert.ok(error instanceof AnnualDataError); assert.equal(error.status, status);
      assert.ok(!JSON.stringify(error).includes('DO_NOT_COPY_ERROR_PAYLOAD')); return true;
    });
  }
  assert.throws(() => normalize({ annual: {} }), error => error.code === 'invalid_response');
  assert.throws(() => normalize({ annual: { code: 'unauthorized', error: 'DO_NOT_COPY_ERROR_TEXT' } }), error => error.code === 'unauthorized' && !error.message.includes('DO_NOT_COPY_ERROR_TEXT'));
});

test('preserves authoritative estimated character counts and never turns missing values into zero', () => {
  const input = fixture(); const result = normalize(input);
  assert.equal(result.demo, false); assert.equal(result.year, 2032);
  assert.equal(result.user.days, 7); assert.equal(result.user.botCount, 12);
  assert.equal(result.user.words, 4321); assert.equal(result.user.wordsEstimated, true);
  assert.equal(result.user.wordsBasis, 'fabricated_fixture_estimate'); assert.equal(result.user.wordsSource, 'annual.co_written_chars');
  input.annual.co_written_chars = 0; assert.equal(normalize(input).user.words, 0);
  input.annual.co_written_chars = null;
  const fallback = normalize(input); assert.equal(fallback.user.words, 9876); assert.equal(fallback.user.wordsEstimated, null); assert.equal(fallback.user.wordsBasis, null);
  input.summary = { status: 'not_built', text: { chars: 99 } }; input.annual.metrics = {};
  const missing = normalize(input);
  for (const key of ['words', 'days', 'botCount', 'sends']) assert.equal(missing.user[key], null);
  assert.equal(missing.user.wordsSource, null);
});

test('supports partial main data while unavailable optional sources remain unavailable', () => {
  const input = fixture(); input.annual.status = 'partial'; input.profile.status = 'not_built'; input.content.status = 'not_built'; input.call.status = 'unavailable';
  const result = normalize(input), bot = botsOf(result)[0];
  assert.equal(result.status, 'partial'); assert.equal(result.user.name, null);
  assert.equal(bot.letter.length, 0); assert.equal(bot.quotes.length, 0); assert.equal(bot.callSegments.length, 0);
  assert.equal(result.yearPoem, undefined);
});

test('retains nine dynamic galaxy rows plus unknown, including source-marked display-name fallbacks', () => {
  const input = fixture(); input.annual.galaxies[1].name = 'API指定测试星系';
  const result = normalize(input);
  assert.equal(result.galaxies.length, 10); assert.equal(result.galaxies.at(-1).id, 'unknown');
  assert.equal(result.galaxies[1].name, 'API指定测试星系'); assert.equal(result.galaxies[1].nameSource, 'api');
  for (const [key, name, theme] of [['drama', '戏剧星系', 1], ['crime', '迷案星系', 0], ['hero', '英雄星系', 2]]) {
    const galaxy = result.galaxies.find(value => value.id === key);
    assert.equal(galaxy.name, name); assert.equal(galaxy.nameSource, 'frontend'); assert.equal(galaxy.themeIndex, theme);
    assert.equal(galaxy.backgroundKind, 'theme_art');
  }
  assert.equal(result.galaxies[0].count, 3); assert.equal(result.galaxies[0].more, 2); assert.equal(result.galaxies[0].words, null);
});

test('only curated galaxy candidates are displayed; complete bots never restore removed names', () => {
  const input = fixture();
  input.annual.bots.push({ bot_id: 'fixture-not-a-candidate', title: 'DO_NOT_RESTORE_NAME', avatar: 'https://media.example/DO_NOT_RESTORE_AVATAR.png', story_ok: true });
  const result = normalize(input);
  assert.equal(botsOf(result).length, 1);
  assert.ok(!JSON.stringify(result).includes('DO_NOT_RESTORE'));
  input.annual.galaxy_bots = {};
  assert.equal(botsOf(normalize(input)).length, 0);
});

for (const source of ['candidate', 'full', 'safety']) for (const safetyFlag of ['deleted', 'hidden', 'minor', 'story_blocked']) {
  test(`${source} ${safetyFlag} excludes identity, images, stories, boxes and call content`, () => {
    const input = fixture(), key = input.annual.bots[0].bot_id;
    if (source === 'candidate') input.annual.galaxy_bots.romance.bots[0][safetyFlag] = true;
    if (source === 'full') input.annual.bots[0][safetyFlag] = true;
    if (source === 'safety') input.annual.safety.bots[key] = { [safetyFlag === 'minor' ? 'is_minor_bot' : safetyFlag]: true };
    const result = normalize(input), output = JSON.stringify(result);
    assert.equal(botsOf(result).length, 0);
    for (const forbidden of [key, '专用测试角色甲', 'fixture-memory', '虚构摘要', '测试来电正文']) assert.ok(!output.includes(forbidden));
  });
}

test('user-hidden IDs and illegal moderation cannot be overridden by light candidate records', () => {
  for (const mode of ['state', 'moderation']) {
    const input = fixture();
    if (mode === 'state') input.annual.state.hidden_bots = ['fixture-role-alpha'];
    else input.annual.bots[0].moderation = 'ILLEGAL';
    assert.equal(botsOf(normalize(input)).length, 0);
  }
});

test('a permissive moderation label cannot mask a restrictive audit label', () => {
  for (const source of ['candidate', 'full', 'safety']) {
    const input = fixture(), key = 'fixture-role-alpha';
    const item = source === 'candidate' ? input.annual.galaxy_bots.romance.bots[0] : source === 'full' ? input.annual.bots[0] : (input.annual.safety.bots[key] = {});
    item.moderation = 'SFW'; item.audit_moderation = 'ILLEGAL';
    assert.equal(botsOf(normalize(input)).length, 0);
    item.audit_moderation = 'NSFW'; input.annual.safe_mode = true;
    assert.equal(botsOf(normalize(input)).length, 0);
  }
});

test('safe mode permits only safe profile/statistical material and no private media or prose', () => {
  const input = fixture(); input.annual.safe_mode = true;
  const result = normalize(input), bot = botsOf(result)[0];
  assert.equal(result.safeMode, true); assert.equal(bot.name, '专用测试角色甲');
  for (const field of ['stories', 'quotes', 'letter', 'images', 'callSegments']) assert.equal(bot[field].length, 0);
  assert.equal(bot.voice, null); assert.equal(bot.imageUrl, undefined); assert.equal(bot.coverUrl, null); assert.equal(result.yearPoem, undefined);
  assert.equal(bot.allowPrivateTTS, false); assert.equal(result.allowPrivateTTS, false);
  const statistical = bot.boxes.find(box => box.form === 'fragment');
  assert.equal(statistical.available, true); assert.ok(statistical.text.includes('51')); assert.equal(statistical.stats.sends, 51);
  assert.ok(bot.boxes.filter(box => box.form !== 'fragment').every(box => !box.available));
  assert.ok(!JSON.stringify(result).includes('虚构摘要'));
  input.annual.bots[0].nsfw = true; assert.equal(botsOf(normalize(input)).length, 0);
});

test('story_ok=false keeps profile/statistics but prevents call, image and narrative availability', () => {
  for (const source of ['full', 'candidate']) {
    const input = fixture();
    (source === 'full' ? input.annual.bots[0] : input.annual.galaxy_bots.romance.bots[0]).story_ok = false;
    const bot = botsOf(normalize(input))[0];
    assert.equal(bot.contentAllowed, false); assert.equal(bot.letter.length, 0); assert.equal(bot.images.length, 0); assert.equal(bot.callSegments.length, 0);
  }
});

test('withheld, ungrounded and unsupported stories never leak through alternate quote or letter fields', () => {
  const input = fixture();
  input.content.planet_plots[0].grounded = false;
  input.content.arc_cards[0].status = 'withheld';
  input.content.arc_cards[0].title = 'WITHHELD_TITLE_SENTINEL';
  input.content.postcard_lines = [{ status: 'unavailable', bot_id: 'fixture-role-alpha', line: { text: 'WITHHELD_QUOTE_SENTINEL', message_id: 'fixture-message-hidden', speaker: 'bot' } }];
  const bot = botsOf(normalize(input))[0];
  assert.equal(bot.letter.length, 0); assert.equal(bot.quotes.length, 0); assert.equal(bot.quote, null);
  assert.ok(!JSON.stringify(normalize(input)).includes('WITHHELD_'));
  input.content.arc_cards[0].reason = 'minor_character';
  assert.equal(botsOf(normalize(input)).length, 0);
});

test('AI summaries and exact historical quotations retain separate provenance and speakers', () => {
  const input = fixture(), bot = botsOf(normalize(input))[0];
  assert.ok(bot.letter.length > 0); assert.ok(bot.letterSources.every(source => source.kind === 'ai_summary'));
  assert.equal(bot.quotes.find(value => value.speaker === 'user').text, '  这句是测试用户原话。  ');
  assert.equal(bot.quote, '这句是测试角色原话。'); assert.equal(bot.quoteKind, 'historical_quote');
  assert.equal(bot.quoteSource.speaker, 'bot'); assert.ok(bot.quotes.every(value => value.messageId && value.source === 'messages'));
  input.content.planet_plots[0].quotes = [input.content.planet_plots[0].quotes[0]];
  const withoutBotQuote = botsOf(normalize(input))[0];
  assert.equal(withoutBotQuote.quoteKind, 'ai_summary'); assert.notEqual(withoutBotQuote.quote, '  这句是测试用户原话。  ');
});

test('arc prose requires a matching passed annual arc, while missing first-met dates stay unknown', () => {
  const input = fixture(); input.content.planet_plots = []; input.annual.arcs[0].safety_status = 'pending'; delete input.annual.bots[0].first_met_day;
  const bot = botsOf(normalize(input))[0];
  assert.equal(bot.stories.length, 0); assert.equal(bot.firstMet, null); assert.equal(bot.firstDay, '2032-01-09');
});

test('a stale ready recap cannot bypass a withheld or unready source arc card', () => {
  for (const status of ['withheld', 'pending', 'insufficient_source']) {
    const input = fixture(); input.content.planet_plots = [];
    input.content.arc_cards[0].status = status;
    input.content.next_stop_recaps = [{ bot_id: 'fixture-role-alpha', status: 'ready', grounded: true, source: 'arc_card', arc_id: 'fixture-arc-a', recap: 'DO_NOT_FORWARD_WITHHELD_RECAP', quotes: [{ message_id: 'fixture-recap-quote', speaker: 'bot', text: 'DO_NOT_FORWARD_WITHHELD_QUOTE' }] }];
    const output = normalize(input);
    assert.equal(botsOf(output)[0].stories.length, 0);
    assert.ok(!JSON.stringify(output).includes('DO_NOT_FORWARD_WITHHELD'));
  }
});

test('explicitly ungrounded arc cards cannot publish acts, quotations or derived recaps as grounded', () => {
  const input = fixture(); input.content.planet_plots = [];
  input.content.arc_cards[0].grounded = false;
  input.content.arc_cards[0].quotes = [{ message_id: 'fixture-ungrounded-message', speaker: 'bot', text: 'DO_NOT_FORWARD_UNGROUNDED_QUOTE' }];
  input.content.next_stop_recaps = [{ bot_id: 'fixture-role-alpha', status: 'ready', grounded: true, source: 'arc_card', arc_id: 'fixture-arc-a', recap: 'DO_NOT_FORWARD_UNGROUNDED_RECAP' }];
  const output = normalize(input), bot = botsOf(output)[0];
  assert.equal(bot.stories.length, 0); assert.equal(bot.quotes.length, 0);
  assert.ok(!JSON.stringify(output).includes('DO_NOT_FORWARD_UNGROUNDED'));
});

test('historical images only come from available image boxes, never portraits or AI-summary image fields', () => {
  const input = fixture(); input.content.planet_plots[0].image_url = 'https://media.example/DO_NOT_USE_PLOT_IMAGE.png';
  let bot = botsOf(normalize(input))[0];
  assert.equal(bot.images.length, 1); assert.equal(bot.images[0].imageUrl, 'https://media.example/fixture-memory.png');
  assert.equal(bot.images[0].kind, 'historical_image'); assert.equal(bot.images[0].source, 'annual.role_boxes.box.image');
  input.annual.role_boxes[0].boxes[1].status = 'unavailable';
  bot = botsOf(normalize(input))[0]; assert.equal(bot.images.length, 0); assert.equal(bot.imageUrl, undefined);
  input.annual.role_boxes[0].boxes[1].status = 'available'; input.annual.role_boxes[0].boxes[1].image.status = 'pending';
  assert.equal(botsOf(normalize(input))[0].images.length, 0);
  input.annual.role_boxes_status = 'not_built'; assert.equal(botsOf(normalize(input))[0].boxes.length, 0);
});

test('the single eligible annual caller receives ordered greeting/body/closing audio segments', () => {
  const result = normalize(fixture()), bot = botsOf(result)[0];
  assert.deepEqual(plain(bot.callSegments.map(segment => segment.kind)), ['greeting', 'line', 'closing']);
  assert.deepEqual(plain(bot.callSegments.map(segment => segment.audioUrl)), ['/v1/audio/fixture-greeting', '/v1/audio/fixture-body', '/v1/audio/fixture-closing']);
  assert.equal(bot.voice, '测试接通语。\n\n测试来电正文。\n\n测试结束语。');
  assert.equal(bot.allowPrivateTTS, false); assert.equal(bot.videoUrl, undefined);
  assert.ok(!JSON.stringify(result).includes('DO_NOT_FORWARD_RAW_EVIDENCE'));
  assert.ok(!JSON.stringify(result).includes('fixture-private-context'));
});

test('mismatched, absent, not-built and unavailable callers never acquire a playable allowlist', () => {
  for (const mode of ['different-caller', 'different-annual', 'missing-annual', 'not_built', 'unavailable', 'postcard']) {
    const input = fixture();
    if (mode === 'different-caller') input.call.caller.bot_id = 'fixture-other-caller';
    else if (mode === 'different-annual') input.annual.call.bot.bot_id = 'fixture-other-caller';
    else if (mode === 'missing-annual') input.annual.call = null;
    else if (mode === 'postcard') input.annual.call.kind = 'postcard';
    else input.call.status = mode;
    const bot = botsOf(normalize(input))[0]; assert.equal(bot.callSegments.length, 0); assert.equal(bot.voice, null);
  }
});

test('partial calls keep text-only segments without inventing audio or authorizing device TTS', () => {
  const input = fixture(); input.call.status = 'partial'; delete input.call.greeting_audio_url; delete input.call.lines[0].audio_url;
  const bot = botsOf(normalize(input))[0];
  assert.equal(bot.callSegments.length, 3); assert.equal(bot.callSegments[0].audioUrl, null); assert.equal(bot.callSegments[1].audioUrl, null);
  assert.equal(bot.allowPrivateTTS, false);
});

test('duplicate candidates cannot receive duplicate annual calls', () => {
  const input = fixture(); input.annual.galaxy_bots.fantasy = { bots: [structuredClone(input.annual.galaxy_bots.romance.bots[0])] };
  const result = normalize(input);
  assert.equal(botsOf(result).filter(bot => bot.callSegments.length).length, 1);
  assert.equal(botsOf(result).filter(bot => bot.id === 'fixture-role-alpha').length, 1);
});

test('URL validation permits public HTTPS images and only strict authenticated audio routes', () => {
  assert.equal(safeURL('https://media.example/picture.png'), 'https://media.example/picture.png');
  for (const value of ['javascript:alert(1)', 'data:image/png;base64,AA', '//media.example/x.png', 'http://media.example/x.png', 'https://user:pass@media.example/x.png', 'https://media.example/\nfile']) assert.equal(safeURL(value), null);
  assert.equal(safeAudioURL('/v1/audio/fixture-1'), '/v1/audio/fixture-1');
  for (const value of ['https://other.example/v1/audio/x', '//other.example/x', '/v1/audio/../private', '/v1/audio/%2e%2e', '/v1/audio/x?token=fixture', '/v1/audio/x#fragment', '/v1/annual']) assert.equal(safeAudioURL(value), null);
});

test('normalization does not mutate inputs or retain arbitrary source payloads', () => {
  const input = fixture(), before = structuredClone(input);
  input.annual.private_extension = { text: 'DO_NOT_FORWARD_UNKNOWN_FIELD' };
  input.profile.secret = 'DO_NOT_FORWARD_UNKNOWN_FIELD'; input.content.meta = { raw: 'DO_NOT_FORWARD_UNKNOWN_FIELD' };
  const snapshot = structuredClone(input), output = normalize(input);
  assert.deepEqual(input, snapshot);
  assert.ok(!JSON.stringify(output).includes('DO_NOT_FORWARD_UNKNOWN_FIELD'));
  assert.ok(!JSON.stringify(output).includes('assets/'));
  output.galaxies[0].bots[0].stories[0].text = 'mutated output only';
  assert.equal(input.content.planet_plots[0].plot, before.content.planet_plots[0].plot);
});
