import mongoose, { Document, Schema } from 'mongoose';

export interface IMeeting extends Document {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  category: 'work' | 'personal' | 'meeting' | 'urgent';
  attendees: {
    id: mongoose.Types.ObjectId;
    email: string;
    name: string;
    status: 'accepted' | 'declined' | 'tentative' | 'pending';
    responseTime?: Date;
  }[];
  location?: string;
  isAllDay: boolean;
  reminders: number[]; // minutes before event
  color?: string;
  recurring?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    interval: number;
    endDate?: Date;
    count?: number;
    daysOfWeek?: number[];
    dayOfMonth?: number;
  };
  status: 'available' | 'busy' | 'tentative' | 'out_of_office';
  createdBy: mongoose.Types.ObjectId;
  meetingType: 'video' | 'phone' | 'in-person' | 'hybrid';
  meetingLink?: string;
  meetingId?: string;
  notes?: string;
  agenda?: string;
  recordingUrl?: string;
  meetingRoom?: string;
  isRecurring: boolean;
  parentMeetingId?: mongoose.Types.ObjectId;
  meetingSettings: {
    autoMute: boolean;
    autoVideoOff: boolean;
    waitingRoom: boolean;
    allowScreenShare: boolean;
    allowChat: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

const MeetingSchema = new Schema<IMeeting>({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    required: true
  },
  category: {
    type: String,
    enum: ['work', 'personal', 'meeting', 'urgent'],
    default: 'meeting'
  },
  attendees: [{
    id: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    email: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['accepted', 'declined', 'tentative', 'pending'],
      default: 'pending'
    },
    responseTime: {
      type: Date
    }
  }],
  location: {
    type: String,
    trim: true
  },
  isAllDay: {
    type: Boolean,
    default: false
  },
  reminders: [{
    type: Number,
    min: 0
  }],
  color: {
    type: String,
    default: '#3B82F6'
  },
  recurring: {
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'yearly']
    },
    interval: {
      type: Number,
      min: 1
    },
    endDate: {
      type: Date
    },
    count: {
      type: Number,
      min: 1
    },
    daysOfWeek: [{
      type: Number,
      min: 0,
      max: 6
    }],
    dayOfMonth: {
      type: Number,
      min: 1,
      max: 31
    }
  },
  status: {
    type: String,
    enum: ['available', 'busy', 'tentative', 'out_of_office'],
    default: 'busy'
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  meetingType: {
    type: String,
    enum: ['video', 'phone', 'in-person', 'hybrid'],
    default: 'video'
  },
  meetingLink: {
    type: String
  },
  meetingId: {
    type: String
  },
  notes: {
    type: String
  },
  agenda: {
    type: String
  },
  recordingUrl: {
    type: String
  },
  meetingRoom: {
    type: String
  },
  isRecurring: {
    type: Boolean,
    default: false
  },
  parentMeetingId: {
    type: Schema.Types.ObjectId,
    ref: 'Meeting'
  },
  meetingSettings: {
    autoMute: {
      type: Boolean,
      default: true
    },
    autoVideoOff: {
      type: Boolean,
      default: true
    },
    waitingRoom: {
      type: Boolean,
      default: false
    },
    allowScreenShare: {
      type: Boolean,
      default: true
    },
    allowChat: {
      type: Boolean,
      default: true
    }
  }
}, {
  timestamps: true
});

// Indexes
MeetingSchema.index({ createdBy: 1, startTime: 1 });
MeetingSchema.index({ 'attendees.id': 1 });
MeetingSchema.index({ startTime: 1, endTime: 1 });
MeetingSchema.index({ meetingType: 1 });
MeetingSchema.index({ isRecurring: 1, parentMeetingId: 1 });

// Virtual for duration
MeetingSchema.virtual('duration').get(function() {
  return this.endTime.getTime() - this.startTime.getTime();
});

// Pre-save middleware to generate meeting link if not provided
MeetingSchema.pre('save', function(next) {
  if (this.meetingType === 'video' && !this.meetingLink) {
    // Generate Jitsi meeting link
    const meetingId = (this._id as any).toString().slice(-8);
    this.meetingId = meetingId;
    this.meetingLink = `https://meet.jit.si/${meetingId}`;
  }
  next();
});

export const Meeting = mongoose.model<IMeeting>('Meeting', MeetingSchema);
