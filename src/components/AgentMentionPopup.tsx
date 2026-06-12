import React from 'react';
import SlashCommandPopup from './SlashCommandPopup';

interface AgentOption {
  name: string;
  description: string;
}

interface Props {
  agents: AgentOption[];
  highlightIndex: number;
  onSelect: (name: string) => void;
  onClose: () => void;
  rect: DOMRect;
  kbHeight?: number;
  isTouchDevice?: boolean;
}

const AgentMentionPopup: React.FC<Props> = ({
  agents,
  highlightIndex,
  onSelect,
  onClose,
  rect,
  kbHeight,
  isTouchDevice,
}) => (
  <SlashCommandPopup
    commands={agents}
    highlightIndex={highlightIndex}
    onSelect={onSelect}
    onClose={onClose}
    rect={rect}
    kbHeight={kbHeight}
    isTouchDevice={isTouchDevice}
  />
);

export default AgentMentionPopup;
