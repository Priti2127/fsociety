import { Response } from 'express';
import { Meeting, IMeeting } from '../models/Meeting';
import { User } from '../models/User';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';

// @desc    Get all meetings
// @route   GET /api/meetings
// @access  Private
export const getMeetings = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { 
    startDate, 
    endDate, 
    meetingType, 
    status, 
    search,
    page = 1,
    limit = 10
  } = req.query;

  const query: any = {
    $or: [
      { createdBy: req.user!._id },
      { 'attendees.id': req.user!._id }
    ]
  };

  // Apply filters
  if (startDate && endDate) {
    query.startTime = {
      $gte: new Date(startDate as string),
      $lte: new Date(endDate as string)
    };
  }
  if (meetingType) query.meetingType = meetingType;
  if (status) query.status = status;
  if (search) {
    query.$and = [
      query,
      {
        $or: [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { location: { $regex: search, $options: 'i' } }
        ]
      }
    ];
  }

  const meetings = await Meeting.find(query)
    .populate('createdBy', 'name email avatar')
    .populate('attendees.id', 'name email avatar')
    .sort({ startTime: 1 })
    .limit(Number(limit) * 1)
    .skip((Number(page) - 1) * Number(limit));

  const total = await Meeting.countDocuments(query);

  res.json({
    success: true,
    data: {
      meetings,
      pagination: {
        current: Number(page),
        pages: Math.ceil(total / Number(limit)),
        total
      }
    }
  });
});

// @desc    Get single meeting
// @route   GET /api/meetings/:id
// @access  Private
export const getMeeting = asyncHandler(async (req: AuthRequest, res: Response) => {
  const meeting = await Meeting.findOne({
    _id: req.params.id,
    $or: [
      { createdBy: req.user!._id },
      { 'attendees.id': req.user!._id }
    ]
  })
    .populate('createdBy', 'name email avatar')
    .populate('attendees.id', 'name email avatar');

  if (!meeting) {
    res.status(404).json({
      success: false,
      message: 'Meeting not found'
    });
    return;
  }

  res.json({
    success: true,
    data: { meeting }
  });
});

// @desc    Create new meeting
// @route   POST /api/meetings
// @access  Private
export const createMeeting = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { attendees, ...meetingData } = req.body;

  // Validate attendees
  if (attendees && attendees.length > 0) {
    const attendeeEmails = attendees.map((a: any) => a.email);
    const existingUsers = await User.find({ email: { $in: attendeeEmails } });
    
    // Add user details for existing users
    const processedAttendees = attendees.map((attendee: any) => {
      const existingUser = existingUsers.find(u => u.email === attendee.email);
      return {
        id: existingUser?._id || null,
        email: attendee.email,
        name: attendee.name || existingUser?.name || attendee.email,
        status: 'pending'
      };
    });

    meetingData.attendees = processedAttendees;
  }

  const meeting = await Meeting.create({
    ...meetingData,
    createdBy: req.user!._id
  });

  await meeting.populate([
    { path: 'createdBy', select: 'name email avatar' },
    { path: 'attendees.id', select: 'name email avatar' }
  ]);

  res.status(201).json({
    success: true,
    message: 'Meeting created successfully',
    data: { meeting }
  });
});

// @desc    Update meeting
// @route   PUT /api/meetings/:id
// @access  Private
export const updateMeeting = asyncHandler(async (req: AuthRequest, res: Response) => {
  const meeting = await Meeting.findOneAndUpdate(
    { _id: req.params.id, createdBy: req.user!._id },
    req.body,
    { new: true, runValidators: true }
  )
    .populate('createdBy', 'name email avatar')
    .populate('attendees.id', 'name email avatar');

  if (!meeting) {
    res.status(404).json({
      success: false,
      message: 'Meeting not found'
    });
    return;
  }

  res.json({
    success: true,
    message: 'Meeting updated successfully',
    data: { meeting }
  });
});

// @desc    Delete meeting
// @route   DELETE /api/meetings/:id
// @access  Private
export const deleteMeeting = asyncHandler(async (req: AuthRequest, res: Response) => {
  const meeting = await Meeting.findOneAndDelete({
    _id: req.params.id,
    createdBy: req.user!._id
  });

  if (!meeting) {
    res.status(404).json({
      success: false,
      message: 'Meeting not found'
    });
    return;
  }

  res.json({
    success: true,
    message: 'Meeting deleted successfully'
  });
});

// @desc    Join meeting
// @route   POST /api/meetings/:id/join
// @access  Private
export const joinMeeting = asyncHandler(async (req: AuthRequest, res: Response) => {
  const meeting = await Meeting.findOne({
    _id: req.params.id,
    $or: [
      { createdBy: req.user!._id },
      { 'attendees.id': req.user!._id }
    ]
  });

  if (!meeting) {
    res.status(404).json({
      success: false,
      message: 'Meeting not found'
    });
    return;
  }

  // Update attendee status if they're in the attendees list
  const attendeeIndex = meeting.attendees.findIndex(
    a => a.id?.toString() === req.user!._id.toString()
  );

  if (attendeeIndex !== -1) {
    meeting.attendees[attendeeIndex].status = 'accepted';
    meeting.attendees[attendeeIndex].responseTime = new Date();
    await meeting.save();
  }

  res.json({
    success: true,
    message: 'Joined meeting successfully',
    data: {
      meetingLink: meeting.meetingLink,
      meetingId: meeting.meetingId,
      meetingSettings: meeting.meetingSettings
    }
  });
});

// @desc    Respond to meeting invitation
// @route   POST /api/meetings/:id/respond
// @access  Private
export const respondToMeeting = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { status } = req.body;

  if (!['accepted', 'declined', 'tentative'].includes(status)) {
    res.status(400).json({
      success: false,
      message: 'Invalid status. Must be accepted, declined, or tentative'
    });
    return;
  }

  const meeting = await Meeting.findOne({
    _id: req.params.id,
    'attendees.id': req.user!._id
  });

  if (!meeting) {
    res.status(404).json({
      success: false,
      message: 'Meeting not found'
    });
    return;
  }

  const attendeeIndex = meeting.attendees.findIndex(
    a => a.id?.toString() === req.user!._id.toString()
  );

  if (attendeeIndex === -1) {
    res.status(404).json({
      success: false,
      message: 'You are not invited to this meeting'
    });
    return;
  }

  meeting.attendees[attendeeIndex].status = status;
  meeting.attendees[attendeeIndex].responseTime = new Date();
  await meeting.save();

  res.json({
    success: true,
    message: `Meeting ${status} successfully`,
    data: { meeting }
  });
});

// @desc    Get upcoming meetings
// @route   GET /api/meetings/upcoming
// @access  Private
export const getUpcomingMeetings = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { days = 7 } = req.query;
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + Number(days));

  const meetings = await Meeting.find({
    $or: [
      { createdBy: req.user!._id },
      { 'attendees.id': req.user!._id }
    ],
    startTime: {
      $gte: new Date(),
      $lte: futureDate
    }
  })
    .populate('createdBy', 'name email avatar')
    .populate('attendees.id', 'name email avatar')
    .sort({ startTime: 1 });

  res.json({
    success: true,
    data: { meetings }
  });
});

// @desc    Get meetings for calendar view
// @route   GET /api/meetings/calendar
// @access  Private
export const getMeetingsForCalendar = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { startDate, endDate, view = 'month' } = req.query;

  if (!startDate || !endDate) {
    res.status(400).json({
      success: false,
      message: 'Start date and end date are required'
    });
    return;
  }

  const meetings = await Meeting.find({
    $or: [
      { createdBy: req.user!._id },
      { 'attendees.id': req.user!._id }
    ],
    startTime: {
      $gte: new Date(startDate as string),
      $lte: new Date(endDate as string)
    }
  })
    .populate('createdBy', 'name email avatar')
    .populate('attendees.id', 'name email avatar')
    .sort({ startTime: 1 });

  res.json({
    success: true,
    data: { meetings }
  });
});

// @desc    Generate meeting link
// @route   POST /api/meetings/:id/generate-link
// @access  Private
export const generateMeetingLink = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { provider = 'jitsi' } = req.body;

  const meeting = await Meeting.findOne({
    _id: req.params.id,
    createdBy: req.user!._id
  });

  if (!meeting) {
    res.status(404).json({
      success: false,
      message: 'Meeting not found'
    });
    return;
  }

  let meetingLink = '';
  let meetingId = '';

  if (provider === 'jitsi') {
    meetingId = (meeting._id as any).toString().slice(-8);
    meetingLink = `https://meet.jit.si/${meetingId}`;
  } else if (provider === 'zoom') {
    // In a real implementation, you would call Zoom API here
    meetingId = `zoom_${(meeting._id as any).toString().slice(-8)}`;
    meetingLink = `https://zoom.us/j/${meetingId}`;
  }

  meeting.meetingLink = meetingLink;
  meeting.meetingId = meetingId;
  await meeting.save();

  res.json({
    success: true,
    message: 'Meeting link generated successfully',
    data: {
      meetingLink,
      meetingId,
      provider
    }
  });
});
