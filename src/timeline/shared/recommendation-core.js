'use strict';

(function exposeRecommendationCore(root) {
  const RULE_VERSION = 'bookmark-recommendation-v3';
  const CONFIDENCE_THRESHOLDS = Object.freeze({
    high: 0.78,
    medium: 0.58,
    low: 0.35,
    highMargin: 0.15,
    mediumMargin: 0.10,
  });
  const EVIDENCE_RELIABILITY = Object.freeze({
    user_rule: 1,
    curated_domain: 0.90,
    learned_rule: 0.85,
    folder_sample: 0.75,
    history_profile: 0.70,
    folder_leaf: 0.70,
    page_content: 0.65,
    folder_name: 0.50,
    domain_path: 0.65,
    domain: 0.40,
    title_metadata: 0.35,
    content_semantic: 0.30,
    ai: 0.45,
    negative_feedback: -0.60,
  });
  const GENERIC_FOLDER_NAMES = new Set([
    'other', 'others', 'misc', 'miscellaneous', 'uncategorized', 'bookmarks',
    '其他', '其它', '杂项', '未分类', '书签', '收藏', '新建文件夹',
  ]);
  const ROOT_FOLDER_NAMES = new Set([
    'bookmarks bar', 'bookmarks toolbar', 'other bookmarks', 'mobile bookmarks',
    '书签栏', '书签工具栏', '其他书签', '移动设备书签',
  ]);

  function clamp01(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 0;
  }

  function normalizeReason(value) {
    return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120);
  }

  function normalizeEvidence(item) {
    if (!item || typeof item !== 'object') return null;
    const family = String(item.family || item.type || '').trim();
    if (!Object.prototype.hasOwnProperty.call(EVIDENCE_RELIABILITY, family)) return null;
    return {
      family,
      direction: item.direction === 'negative' ? 'negative' : 'positive',
      strength: clamp01(item.strength === undefined ? 1 : item.strength),
      reason: normalizeReason(item.reason || item.label || family),
      source: normalizeReason(item.source || ''),
    };
  }

  function scoreEvidence(rawEvidence) {
    const positiveByFamily = new Map();
    const negativeByFamily = new Map();
    const evidence = [];
    for (const raw of Array.isArray(rawEvidence) ? rawEvidence : []) {
      const item = normalizeEvidence(raw);
      if (!item || item.strength <= 0) continue;
      evidence.push(item);
      const reliability = EVIDENCE_RELIABILITY[item.family];
      const negative = item.direction === 'negative' || reliability < 0;
      const target = negative ? negativeByFamily : positiveByFamily;
      target.set(item.family, Math.max(target.get(item.family) || 0, Math.abs(reliability) * item.strength));
    }

    let inverseSupport = 1;
    for (const contribution of positiveByFamily.values()) inverseSupport *= (1 - clamp01(contribution));
    let support = 1 - inverseSupport;
    for (const penalty of negativeByFamily.values()) support -= penalty;
    support = clamp01(support);

    return {
      support,
      evidence,
      positiveFamilies: [...positiveByFamily.keys()],
      negativeFamilies: [...negativeByFamily.keys()],
    };
  }

  function candidateKey(candidate) {
    const kind = candidate?.kind === 'tag' ? 'tag' : 'folder';
    if (kind === 'tag') return `tag:${String(candidate?.tag || candidate?.label || '').trim().toLowerCase()}`;
    const path = String(candidate?.folderPath || candidate?.path || '').trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/');
    const id = String(candidate?.id || candidate?.folderId || '');
    return `folder:${path ? path.toLowerCase() : id}`;
  }

  function mergeLocalEvidence(left, right) {
    if (!left && !right) return undefined;
    const values = [left, right].filter(Boolean);
    return {
      pageContentUsed: values.some(item => item.pageContentUsed === true),
      pageFields: [...new Set(values.flatMap(item => item.pageFields || []))],
      matchedTerms: [...new Set(values.flatMap(item => item.matchedTerms || []))].slice(0, 8),
      sampledCount: Math.max(0, ...values.map(item => Number(item.sampledCount) || 0)),
      contentSampleCount: Math.max(0, ...values.map(item => Number(item.contentSampleCount) || 0)),
      matchedSampleCount: Math.max(0, ...values.map(item => Number(item.matchedSampleCount) || 0)),
      matchedSampleTitles: [...new Set(values.flatMap(item => item.matchedSampleTitles || []))].filter(Boolean).slice(0, 3),
      folderNameMatched: values.some(item => item.folderNameMatched === true),
    };
  }

  function confidenceFor(support, margin, positiveFamilies, options = {}) {
    const families = new Set(positiveFamilies || []);
    const explicit = families.has('user_rule') || families.has('curated_domain');
    const learned = families.has('learned_rule');
    const independent = [...families].filter(family => family !== 'ai').length;
    const candidate = options.candidate;
    const localEvidence = candidate?.localEvidence;
    const localHighConfidenceEligible = candidate?.kind === 'tag'
      || explicit
      || learned
      || families.has('ai')
      || !!(localEvidence?.pageContentUsed && (
        localEvidence.folderNameMatched
        || Number(localEvidence.matchedSampleCount || 0) >= 2
      ));
    if (support >= CONFIDENCE_THRESHOLDS.high
      && margin >= CONFIDENCE_THRESHOLDS.highMargin
      && localHighConfidenceEligible
      && (explicit || learned || independent >= 2 || (families.has('ai') && independent >= 1))) return 'high';
    if (support >= CONFIDENCE_THRESHOLDS.medium
      && margin >= CONFIDENCE_THRESHOLDS.mediumMargin) return 'medium';
    if (support >= CONFIDENCE_THRESHOLDS.low) return 'low';
    return options.allowNone === false ? 'low' : 'none';
  }

  function rankCandidates(rawCandidates, options = {}) {
    const byKey = new Map();
    for (const raw of Array.isArray(rawCandidates) ? rawCandidates : []) {
      if (!raw || typeof raw !== 'object') continue;
      const key = candidateKey(raw);
      if (key.endsWith(':') || key.endsWith('::')) continue;
      const current = byKey.get(key) || {
        ...raw,
        evidence: [],
        reasons: [],
        sources: [],
      };
      current.id = current.id || raw.id || raw.folderId || '';
      current.folderId = current.folderId || raw.folderId || raw.id || '';
      current.path = current.path || raw.path || raw.folderPath || '';
      current.folderPath = current.folderPath || raw.folderPath || raw.path || '';
      current.exists = current.exists || !!raw.exists;
      current.localEvidence = mergeLocalEvidence(current.localEvidence, raw.localEvidence);
      current.evidence.push(...(Array.isArray(raw.evidence) ? raw.evidence : []));
      current.reasons.push(...(Array.isArray(raw.reasons) ? raw.reasons : []));
      if (raw.source) current.sources.push(String(raw.source));
      if (Array.isArray(raw.sources)) current.sources.push(...raw.sources.map(String));
      byKey.set(key, current);
    }

    const ranked = [...byKey.values()].map((candidate) => {
      const scored = scoreEvidence(candidate.evidence);
      return {
        ...candidate,
        support: scored.support,
        score: Math.round(scored.support * 1000) / 10,
        evidence: scored.evidence,
        reasons: [...new Set([...candidate.reasons, ...scored.evidence.map(item => item.reason)].filter(Boolean))].slice(0, 3),
        sources: [...new Set(candidate.sources)].slice(0, 6),
        positiveFamilies: scored.positiveFamilies,
        negativeFamilies: scored.negativeFamilies,
      };
    }).filter(candidate => candidate.support >= (options.minimumSupport ?? CONFIDENCE_THRESHOLDS.low));

    ranked.sort((left, right) => {
      if (right.support !== left.support) return right.support - left.support;
      if (!!right.exists !== !!left.exists) return right.exists ? 1 : -1;
      const leftName = left.folderPath || left.path || left.tag || left.label || '';
      const rightName = right.folderPath || right.path || right.tag || right.label || '';
      return String(leftName).localeCompare(String(rightName), 'zh');
    });

    const limited = ranked.slice(0, Math.max(1, Math.min(3, Number(options.limit) || 3)));
    return limited.map((candidate, index) => {
      const nextSupport = limited[index + 1]?.support || 0;
      const margin = Math.max(0, candidate.support - nextSupport);
      const confidence = index === 0
        ? confidenceFor(candidate.support, margin, candidate.positiveFamilies, { candidate })
        : (candidate.support >= CONFIDENCE_THRESHOLDS.medium ? 'medium' : 'low');
      return { ...candidate, rank: index + 1, margin, confidence };
    });
  }

  function summarizeRecommendation(tagCandidates, folderCandidates) {
    const folders = rankCandidates(folderCandidates);
    const tags = rankCandidates(tagCandidates);
    const top = folders[0] || tags[0] || null;
    return {
      tags,
      folders,
      confidence: top?.confidence || 'none',
      abstained: !top || top.confidence === 'none',
      selectedFolderPath: folders[0]?.confidence === 'high' ? (folders[0].folderPath || folders[0].path || '') : '',
    };
  }

  function shouldTriggerAI(result, options = {}) {
    const candidates = Array.isArray(result?.folders) && result.folders.length ? result.folders : (result?.tags || []);
    const top = candidates[0];
    if (options.needsNewFolder) return { trigger: true, reason: 'new_folder_needed' };
    if (top?.confidence === 'high') return { trigger: false, reason: 'local_high_confidence' };
    if (options.signalConflict) return { trigger: true, reason: 'signal_conflict' };
    if (top && top.margin < CONFIDENCE_THRESHOLDS.mediumMargin) return { trigger: true, reason: 'candidate_tie' };
    if (!top || top.support < CONFIDENCE_THRESHOLDS.medium) return { trigger: true, reason: 'low_confidence' };
    return { trigger: false, reason: 'local_medium_confidence' };
  }

  function normalizedFolderParts(path) {
    return String(path || '').replace(/\\/g, '/').split('/').map(part => part.trim()).filter(Boolean);
  }

  function comparableFolderPath(path) {
    return normalizedFolderParts(path)
      .map(part => part.toLowerCase().replace(/[\s._-]+/g, ''))
      .join('/');
  }

  function validateNewFolderPath(path, existingFolders = []) {
    const parts = normalizedFolderParts(path);
    if (parts.length < 1 || parts.length > 3) return { valid: false, reason: 'invalid_depth' };
    if (parts.some(part => part.length > 40)) return { valid: false, reason: 'segment_too_long' };
    if (parts.some(part => part === '.' || part === '..' || /[\u0000-\u001f\u007f<>:"|?*]/.test(part))) {
      return { valid: false, reason: 'invalid_segment' };
    }
    if (ROOT_FOLDER_NAMES.has(parts[0].toLowerCase())) return { valid: false, reason: 'browser_root' };
    if (GENERIC_FOLDER_NAMES.has(parts[parts.length - 1].toLowerCase())) return { valid: false, reason: 'generic_name' };
    const normalized = parts.join('/');
    const exact = (Array.isArray(existingFolders) ? existingFolders : []).find((folder) => {
      const candidate = normalizedFolderParts(folder?.path || folder?.folderPath).join('/');
      return candidate.localeCompare(normalized, undefined, { sensitivity: 'accent' }) === 0;
    });
    if (exact) return { valid: false, reason: 'already_exists', existing: exact, normalized };
    const comparable = comparableFolderPath(normalized);
    const similar = (Array.isArray(existingFolders) ? existingFolders : []).find((folder) => {
      const candidate = comparableFolderPath(folder?.path || folder?.folderPath);
      return candidate && candidate === comparable;
    });
    if (similar) return { valid: false, reason: 'similar_existing', existing: similar, normalized };
    return { valid: true, reason: '', normalized };
  }

  function isValidDomainPattern(value) {
    const domain = String(value || '').trim().toLowerCase();
    return domain.length > 0
      && domain.length <= 253
      && !domain.includes('/')
      && !domain.includes(':')
      && domain.split('.').every(part => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(part));
  }

  function hostnameMatchesRule(hostname, ruleDomain) {
    const host = String(hostname || '').trim().toLowerCase().replace(/^www\./, '');
    const domain = String(ruleDomain || '').trim().toLowerCase().replace(/^www\./, '');
    return !!host && !!domain && (host === domain || host.endsWith(`.${domain}`));
  }

  function auditRuleSet({
    domainRules = [],
    urlPathRules = [],
    keywordMap = {},
    prototypes = {},
    taxonomy = {},
    aliases = {},
  } = {}) {
    const errors = [];
    const domainTargets = new Map();
    const domainOccurrences = new Map();
    const taxonomyEntries = Object.entries(taxonomy || {});
    const taxonomyLabels = new Set(taxonomyEntries.map(([, category]) => String(category?.label || '').trim()).filter(Boolean));
    for (const [ruleIndex, rule] of domainRules.entries()) {
      const tag = String(rule?.tag || '').trim();
      if (!tag) errors.push({ code: 'empty_domain_tag' });
      else if (!taxonomyLabels.has(tag)) errors.push({ code: 'unknown_domain_tag', value: tag });
      for (const rawDomain of rule?.domains || []) {
        const domain = String(rawDomain || '').trim().toLowerCase();
        if (!isValidDomainPattern(domain)) errors.push({ code: 'invalid_domain', value: domain, tag });
        if (!domainTargets.has(domain)) domainTargets.set(domain, new Set());
        domainTargets.get(domain).add(tag);
        const occurrenceKey = `${domain}\u0000${tag}`;
        if (domainOccurrences.has(occurrenceKey)) {
          errors.push({ code: 'duplicate_domain_rule', value: domain, tag, rules: [domainOccurrences.get(occurrenceKey), ruleIndex] });
        } else {
          domainOccurrences.set(occurrenceKey, ruleIndex);
        }
      }
    }
    for (const [domain, targets] of domainTargets) {
      if (targets.size > 1) errors.push({ code: 'ambiguous_domain', value: domain, tags: [...targets] });
    }
    const pathTargets = new Map();
    const pathOccurrences = new Map();
    for (const [ruleIndex, rule] of urlPathRules.entries()) {
      const tag = String(rule?.tag || '').trim();
      if (!tag) errors.push({ code: 'empty_path_tag' });
      else if (!taxonomyLabels.has(tag)) errors.push({ code: 'unknown_path_tag', value: tag });
      const patterns = rule?.patterns || [];
      if (!patterns.some(pattern => String(pattern || '').includes('/'))) {
        errors.push({ code: 'unreachable_path_rule', tag: rule?.tag || '' });
      }
      for (const rawPattern of patterns) {
        const pattern = String(rawPattern || '').trim().toLowerCase();
        if (!pattern.startsWith('/') || /[?#]/.test(pattern)) {
          errors.push({ code: 'invalid_path_pattern', value: pattern, tag });
        }
        if (!pathTargets.has(pattern)) pathTargets.set(pattern, new Set());
        pathTargets.get(pattern).add(tag);
        const occurrenceKey = `${pattern}\u0000${tag}`;
        if (pathOccurrences.has(occurrenceKey)) {
          errors.push({ code: 'duplicate_path_rule', value: pattern, tag, rules: [pathOccurrences.get(occurrenceKey), ruleIndex] });
        } else {
          pathOccurrences.set(occurrenceKey, ruleIndex);
        }
      }
    }
    for (const [pattern, targets] of pathTargets) {
      if (targets.size > 1) errors.push({ code: 'ambiguous_path_rule', value: pattern, tags: [...targets] });
    }
    const taxonomyIds = new Set();
    for (const [id, category] of taxonomyEntries) {
      const label = String(category?.label || '').trim();
      if (!id || id === 'undefined' || taxonomyIds.has(id)) errors.push({ code: 'invalid_taxonomy_id', value: id });
      taxonomyIds.add(id);
      if (category?.id !== id) errors.push({ code: 'taxonomy_id_mismatch', value: id });
      if (!label) errors.push({ code: 'empty_taxonomy_label', value: id });
      if (!Object.prototype.hasOwnProperty.call(prototypes, label)) errors.push({ code: 'missing_prototype', value: label });
      if (!Array.isArray(keywordMap[label]) || keywordMap[label].length === 0) errors.push({ code: 'missing_keywords', value: label });
    }
    for (const label of Object.keys(prototypes || {})) {
      if (!taxonomyLabels.has(label)) errors.push({ code: 'orphan_prototype', value: label });
    }
    for (const label of Object.keys(keywordMap || {})) {
      if (!taxonomyLabels.has(label)) errors.push({ code: 'orphan_keyword_category', value: label });
    }
    for (const [alias, target] of Object.entries(aliases || {})) {
      if (!String(alias || '').trim() || !taxonomyLabels.has(String(target || '').trim())) {
        errors.push({ code: 'unknown_alias', value: alias, target });
      }
    }
    return { valid: errors.length === 0, errors };
  }

  root.BookmarkRecommendationCore = Object.freeze({
    RULE_VERSION,
    CONFIDENCE_THRESHOLDS,
    EVIDENCE_RELIABILITY,
    aggregateEvidence: scoreEvidence,
    auditRuleSet,
    confidenceFor,
    hostnameMatchesRule,
    isValidDomainPattern,
    rankCandidates,
    shouldTriggerAI,
    summarizeRecommendation,
    validateNewFolderPath,
  });
})(typeof self !== 'undefined' ? self : globalThis);
