import { Response } from 'express';
import { BookingPage, IBookingPage } from '../models/BookingPage';
import { Meeting } from '../models/Meeting';
import { User } from '../models/User';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { NotificationService } from '../services/notificationService';

// @desc    Get user's booking pages
// @route   GET /api/bookings
// @access  Private
export const getUserBookingPages = asyncHandler(async (req: AuthRequest, res: Response) => {
  const bookingPages = await BookingPage.find({ userId: req.user!._id })
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    data: { bookingPages }
  });
});

// @desc    Create booking page
// @route   POST /api/bookings
// @access  Private
export const createBookingPage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { slug, title, description, meetingTypes, availability, customFields, settings } = req.body;

  // Check if slug is already taken
  const existingPage = await BookingPage.findOne({ slug });
  if (existingPage) {
    res.status(400).json({
      success: false,
      message: 'This URL slug is already taken'
    });
    return;
  }

  const bookingPage = await BookingPage.create({
    userId: req.user!._id,
    slug,
    title,
    description,
    meetingTypes,
    availability,
    customFields,
    settings,
    timezone: req.user!.timezone
  });

  res.status(201).json({
    success: true,
    message: 'Booking page created successfully',
    data: { bookingPage }
  });
});

// @desc    Update booking page
// @route   PUT /api/bookings/:id
// @access  Private
export const updateBookingPage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const bookingPage = await BookingPage.findOneAndUpdate(
    { _id: req.params.id, userId: req.user!._id },
    req.body,
    { new: true, runValidators: true }
  );

  if (!bookingPage) {
    res.status(404).json({
      success: false,
      message: 'Booking page not found'
    });
    return;
  }

  res.json({
    success: true,
    message: 'Booking page updated successfully',
    data: { bookingPage }
  });
});

// @desc    Delete booking page
// @route   DELETE /api/bookings/:id
// @access  Private
export const deleteBookingPage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const bookingPage = await BookingPage.findOneAndDelete({
    _id: req.params.id,
    userId: req.user!._id
  });

  if (!bookingPage) {
    res.status(404).json({
      success: false,
      message: 'Booking page not found'
    });
    return;
  }

  res.json({
    success: true,
    message: 'Booking page deleted successfully'
  });
});

// @desc    Get public booking page
// @route   GET /api/bookings/:slug
// @access  Public
export const getPublicBookingPage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const bookingPage = await BookingPage.findOne({
    slug: req.params.slug,
    isActive: true
  }).populate('userId', 'name email avatar');

  if (!bookingPage) {
    res.status(404).json({
      success: false,
      message: 'Booking page not found'
    });
    return;
  }

  res.json({
    success: true,
    data: { bookingPage }
  });
});

// @desc    Book a meeting
// @route   POST /api/bookings/:slug/book
// @access  Public
export const bookMeeting = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { slug } = req.params;
  const { meetingTypeId, startTime, endTime, attendeeInfo, customFields } = req.body;

  const bookingPage = await BookingPage.findOne({
    slug,
    isActive: true
  }).populate('userId', 'name email');

  if (!bookingPage) {
    res.status(404).json({
      success: false,
      message: 'Booking page not found'
    });
    return;
  }

  // Find the meeting type
  const meetingType = bookingPage.meetingTypes.find(mt => mt.id === meetingTypeId);
  if (!meetingType) {
    res.status(400).json({
      success: false,
      message: 'Invalid meeting type'
    });
    return;
  }

  // Check availability
  const isAvailable = await checkAvailability(bookingPage, startTime, endTime);
  if (!isAvailable) {
    res.status(400).json({
      success: false,
      message: 'Selected time slot is not available'
    });
    return;
  }

  // Create meeting
  const meeting = await Meeting.create({
    title: `${meetingType.name} - ${attendeeInfo.name}`,
    description: `Meeting booked through ${bookingPage.title}`,
    startTime: new Date(startTime),
    endTime: new Date(endTime),
    category: 'meeting',
    attendees: [
      {
        id: bookingPage.userId._id,
        email: (bookingPage.userId as any).email,
        name: (bookingPage.userId as any).name,
        status: 'accepted'
      },
      {
        id: null,
        email: attendeeInfo.email,
        name: attendeeInfo.name,
        status: 'pending'
      }
    ],
    meetingType: 'video',
    createdBy: bookingPage.userId._id,
    notes: `Custom fields: ${JSON.stringify(customFields)}`
  });

  // Send notification to organizer
  await NotificationService.sendToUser(
    bookingPage.userId._id.toString(),
    {
      title: 'New Meeting Booking',
      body: `${attendeeInfo.name} has booked a meeting with you`,
      data: { meetingId: meeting._id, type: 'meeting_booking' }
    }
  );

  res.status(201).json({
    success: true,
    message: 'Meeting booked successfully',
    data: { meeting }
  });
});

// @desc    Get available time slots
// @route   GET /api/bookings/:slug/availability
// @access  Public
export const getAvailableSlots = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { slug } = req.params;
  const { date, duration } = req.query;

  const bookingPage = await BookingPage.findOne({
    slug,
    isActive: true
  });

  if (!bookingPage) {
    res.status(404).json({
      success: false,
      message: 'Booking page not found'
    });
    return;
  }

  const availableSlots = await generateAvailableSlots(
    bookingPage,
    new Date(date as string),
    parseInt(duration as string)
  );

  res.json({
    success: true,
    data: { availableSlots }
  });
});

// Helper function to check availability
async function checkAvailability(bookingPage: IBookingPage, startTime: string, endTime: Date) {
  const start = new Date(startTime);
  const dayOfWeek = start.getDay();
  
  // Check if the day is available
  const dayAvailability = bookingPage.availability.find(a => a.dayOfWeek === dayOfWeek);
  if (!dayAvailability || !dayAvailability.isAvailable) {
    return false;
  }

  // Check if time is within working hours
  const startHour = parseInt(dayAvailability.startTime.split(':')[0]);
  const endHour = parseInt(dayAvailability.endTime.split(':')[0]);
  const meetingStartHour = start.getHours();
  
  if (meetingStartHour < startHour || meetingStartHour >= endHour) {
    return false;
  }

  // Check for existing meetings
  const existingMeetings = await Meeting.find({
    $or: [
      { createdBy: bookingPage.userId },
      { 'attendees.id': bookingPage.userId }
    ],
    startTime: { $lt: endTime },
    endTime: { $gt: start }
  });

  return existingMeetings.length === 0;
}

// Helper function to generate available slots
async function generateAvailableSlots(bookingPage: IBookingPage, date: Date, duration: number) {
  const slots: any[] = [];
  const dayOfWeek = date.getDay();
  
  const dayAvailability = bookingPage.availability.find(a => a.dayOfWeek === dayOfWeek);
  if (!dayAvailability || !dayAvailability.isAvailable) {
    return slots;
  }

  const startHour = parseInt(dayAvailability.startTime.split(':')[0]);
  const endHour = parseInt(dayAvailability.endTime.split(':')[0]);
  
  for (let hour = startHour; hour < endHour; hour++) {
    const slotStart = new Date(date);
    slotStart.setHours(hour, 0, 0, 0);
    
    const slotEnd = new Date(slotStart);
    slotEnd.setMinutes(slotEnd.getMinutes() + duration);
    
    if (slotEnd.getHours() <= endHour) {
      const isAvailable = await checkAvailability(bookingPage, slotStart.toISOString(), slotEnd);
      if (isAvailable) {
        slots.push({
          start: slotStart,
          end: slotEnd,
          available: true
        });
      }
    }
  }
  
  return slots;
}
