import mongoose, { Schema, type Document } from "mongoose";

const adminSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["admin"], default: "admin", unique: true },
  },
  { timestamps: true },
);

const tournamentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true },
    description: { type: String, default: "" },
    venue: { type: String, default: "" },
    logoUrl: { type: String, default: null },
    format: { type: String, enum: ["league", "knockout", "group-knockout"], required: true },
    status: { type: String, enum: ["draft", "active", "completed"], default: "draft", index: true },
    maxTeams: { type: Number, required: true, min: 2 },
    championId: { type: String, default: null },
  },
  { timestamps: true },
);

const teamSchema = new Schema(
  {
    tournamentId: { type: Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true, trim: true },
    shortName: { type: String, required: true, trim: true, uppercase: true },
    logoUrl: { type: String, default: null },
    city: { type: String, default: "" },
    group: { type: String, default: null },
  },
  { timestamps: true },
);
teamSchema.index({ tournamentId: 1, name: 1 }, { unique: true });

const stageSchema = new Schema(
  {
    tournamentId: { type: Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ["league", "group", "knockout"], required: true },
    order: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ["upcoming", "active", "completed"], default: "upcoming" },
    qualifiedTeamIds: { type: [String], default: [] },
  },
  { timestamps: true },
);
stageSchema.index({ tournamentId: 1, order: 1 }, { unique: true });

const eventSchema = new Schema(
  {
    type: { type: String, enum: ["goal", "yellow-card", "red-card", "substitution"], required: true },
    minute: { type: Number, min: 0, max: 130, required: true },
    teamId: { type: String, default: null },
    playerName: { type: String, default: "" },
    detail: { type: String, default: "" },
  },
  { timestamps: true },
);

const matchSchema = new Schema(
  {
    tournamentId: { type: Schema.Types.ObjectId, required: true, index: true },
    stageId: { type: String, required: true, index: true },
    round: { type: String, default: "" },
    homeTeamId: { type: String, required: true },
    awayTeamId: { type: String, required: true },
    kickoffAt: { type: Date, default: null },
    venue: { type: String, default: "" },
    status: { type: String, enum: ["scheduled", "live", "completed"], default: "scheduled", index: true },
    minute: { type: Number, default: 0, min: 0, max: 130 },
    homeScore: { type: Number, default: 0, min: 0 },
    awayScore: { type: Number, default: 0, min: 0 },
    events: { type: [eventSchema], default: [] },
  },
  { timestamps: true },
);

export const Admin = mongoose.models.Admin ?? mongoose.model("Admin", adminSchema);
export const Tournament = mongoose.models.Tournament ?? mongoose.model("Tournament", tournamentSchema);
export const Team = mongoose.models.Team ?? mongoose.model("Team", teamSchema);
export const Stage = mongoose.models.Stage ?? mongoose.model("Stage", stageSchema);
export const Match = mongoose.models.Match ?? mongoose.model("Match", matchSchema);

let mongoConnection: Promise<void> | null = null;

export async function connectMongo(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI must be configured to run the tournament API.");
  if (mongoose.connection.readyState === 1) return;
  if (mongoConnection) return mongoConnection;
  mongoConnection = mongoose.connect(uri, {
    dbName: process.env.MONGODB_DATABASE || undefined,
    serverSelectionTimeoutMS: 12_000,
  }).then(() => undefined).catch((error: unknown) => {
    mongoConnection = null;
    throw error;
  });
  return mongoConnection;
}

export function toPlain<T extends Document>(doc: T) {
  const value = doc.toObject({ flattenObjectIds: true, versionKey: false }) as Record<string, any>;
  const plain: Record<string, any> = {
    ...value,
    id: String(value._id),
    createdAt: new Date(value.createdAt).toISOString(),
    updatedAt: value.updatedAt ? new Date(value.updatedAt).toISOString() : undefined,
  };
  return plain;
}

export function toMatch(doc: InstanceType<typeof Match>) {
  const value = toPlain(doc);
  return {
    ...value,
    stageId: String(value.stageId),
    kickoffAt: value.kickoffAt ? new Date(value.kickoffAt).toISOString() : null,
    events: (doc.events ?? []).map((event: any) => ({
      id: String(event._id),
      matchId: String(doc._id),
      type: event.type,
      minute: event.minute,
      teamId: event.teamId ?? null,
      playerName: event.playerName ?? "",
      detail: event.detail ?? "",
      createdAt: event.createdAt ? new Date(event.createdAt).toISOString() : new Date().toISOString(),
    })),
  };
}
