export type PresetType = "5mb" | "xml";

export type PresetLink = {
  type: PresetType;
  url: string;
  title?: string;
  size?: string;
  ratio?: string;
  thumb?: string;
  thumbs?: string[];
  verified?: boolean;
  source?: string;
  detail?: string;
  byAuthor?: boolean;
  pinned?: boolean;
};

export type VideoStats = {
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
};

export type FindResult = {
  ok: boolean;
  found?: boolean;
  author?: string | null;
  videoUrl?: string;
  message?: string;
  context?: { level: "core" | "support" | "none"; matched: string[] };
  checked?: {
    description?: boolean;
    bio?: boolean;
    bioLinkPage?: boolean;
    linkInBio?: number;
    comments?: number;
    replies?: number;
    context?: "core" | "support" | "none";
    invalidLinks?: number;
  };
  shareLinks?: {
    url: string;
    kind: "chat" | "channel" | "group" | "telegram";
    title?: string;
    avatar?: string;
    username?: string;
  }[];
  presetLinks?: PresetLink[];
  otherLinks?: { url: string; source?: string; detail?: string }[];
  video?: {
    description?: string;
    stats?: VideoStats;
    cover?: string;
    playUrl?: string;
    playUrlNoWm?: string;
    width?: number;
    height?: number;
  };
  authorDetail?: {
    uniqueId?: string;
    nickname?: string;
    bio?: string;
    bioLink?: string | null;
    avatar?: string;
  };
  error?: string;
};
