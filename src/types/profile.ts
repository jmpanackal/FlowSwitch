export type ProfileAction =
  | {
      type: 'app';
      name: string;
      path: string;
      monitor: number;
    }
  | {
      type: 'browserTab';
      url: string;
      browser: string;
      monitor: number;
    };

export type Profile = {
    id: string;
    name: string;
    icon: string;
    tags: string[];
    volume: number;
    actions: ProfileAction[];
};