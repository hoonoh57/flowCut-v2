export interface Track {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'text';
  order: number;
  height: number;
  color: string;
  locked: boolean;
  visible: boolean;
  muted?: boolean;
  solo?: boolean;
  grouped?: boolean;
}
