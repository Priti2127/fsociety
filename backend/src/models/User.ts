import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  email: string;
  name: string;
  avatar?: string;
  role: 'admin' | 'user' | 'viewer';
  timezone: string;
  workingHours: {
    start: string;
    end: string;
    days: number[];
  };
  preferences: {
    theme: 'dark' | 'light' | 'auto';
    notifications: boolean;
    emailReminders: boolean;
    defaultMeetingDuration: number;
    bufferTime: number;
  };
  password?: string;
  googleId?: string;
  microsoftId?: string;
  refreshTokens: string[];
  isEmailVerified: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  avatar: {
    type: String,
    default: ''
  },
  role: {
    type: String,
    enum: ['admin', 'user', 'viewer'],
    default: 'user'
  },
  timezone: {
    type: String,
    default: 'UTC'
  },
  workingHours: {
    start: {
      type: String,
      default: '09:00'
    },
    end: {
      type: String,
      default: '17:00'
    },
    days: {
      type: [Number],
      default: [1, 2, 3, 4, 5] // Monday to Friday
    }
  },
  preferences: {
    theme: {
      type: String,
      enum: ['dark', 'light', 'auto'],
      default: 'dark'
    },
    notifications: {
      type: Boolean,
      default: true
    },
    emailReminders: {
      type: Boolean,
      default: true
    },
    defaultMeetingDuration: {
      type: Number,
      default: 30
    },
    bufferTime: {
      type: Number,
      default: 15
    }
  },
  password: {
    type: String,
    minlength: 6
  },
  googleId: {
    type: String,
    sparse: true
  },
  microsoftId: {
    type: String,
    sparse: true
  },
  refreshTokens: [{
    type: String
  }],
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  lastLoginAt: {
    type: Date
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete (ret as any).password;
      delete (ret as any).refreshTokens;
      return ret;
    }
  }
});

// Indexes
UserSchema.index({ email: 1 });
UserSchema.index({ googleId: 1 });
UserSchema.index({ microsoftId: 1 });

export const User = mongoose.model<IUser>('User', UserSchema);
