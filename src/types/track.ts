export interface Track {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'text';
  order: number;
  height: number;
  color: string;
  locked: boolean;
  visible: boolean;
  grouped?: boolean;  // When true, ripple edits affect this track along with others
}
