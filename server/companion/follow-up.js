export function explicitFollowUpTopic(question) {
  const topic = /(?:刚才|上次|之前)(?:说|提|聊|讲)(?:过|起|了)?(?:的|到)?([^，。！？?\n]{1,20}?)(?:呢|怎么样|[？?]|$)/u.exec(question)?.[1]?.trim();
  return topic && !/^(?:那|这|最后|上[一条句段件]|什么)/u.test(topic) ? topic : null;
}
export const isFollowUp = question => !explicitFollowUpTopic(question) && /刚才|上一句|上句话|最后.{0,6}(?:事|句|段|条)|那件事|那个故事|接着|继续(?:说|聊|讲)|后来/u.test(question);

export function displayAnchor(event) {
  if (!event || event.type !== 'assistant' || event.deliveryState !== 'displayed' || event.deleted || !event.text) return null;
  return { id: event.id, text: event.text.slice(0, 1000), speakerName: event.speakerName,
    displayedAt: event.displayedAt || event.at, topicId: event.topicId,
    ...(event.sourceEvidence?.text && { sourceEvidence: { ...event.sourceEvidence, text: event.sourceEvidence.text.slice(0, 1500) } }) };
}

export function followUpPrompt(anchor) {
  return anchor ? '【本次接续对象：最后实际展示的台词】\n' + JSON.stringify(anchor)
    + '\n“刚才/最后/那件事”只指这条已展示台词。先回应玩家对它提出的问题；旧检索话题不能替换接续对象，未展示尾段不能假定已讲。原始资料只供核对，已说的小事不自动成为原卡正史；不把过去经历改成尚未完成的计划，不虚构玩家的回应。'
    : '【本次接续对象】没有可核对的上一条已展示台词；不要自行挑一个旧故事冒充“刚才”，请自然确认玩家想接着哪件事聊。';
}
