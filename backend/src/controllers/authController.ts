import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { User, IUser } from '../models/User';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';

// Generate JWT Token
const generateToken = (userId: string): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not defined');
  }
  return jwt.sign(
    { userId },
    secret,
    { expiresIn: process.env.JWT_EXPIRE ?? '7d' } as any
  );
};

const generateRefreshToken = (userId: string): string => {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET is not defined');
  }
  return jwt.sign(
    { userId }, 
    secret, 
    { expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d' } as any
  );
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
export const register = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password, timezone } = req.body;

  // Check if user exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    res.status(400).json({
      success: false,
      message: 'User already exists with this email'
    });
    return;
  }

  // Hash password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // Create user
  const user = await User.create({
    name,
    email,
    password: hashedPassword,
    timezone: timezone || 'UTC'
  });

  const userId = typeof user._id === 'string' ? user._id : user._id?.toString?.();
  if (!userId) {
    res.status(500).json({
      success: false,
      message: 'User ID is invalid'
    });
    return;
  }

  const token = generateToken(userId);
  const refreshToken = generateRefreshToken(userId);

  // Add refresh token to user
  user.refreshTokens.push(refreshToken);
  await user.save();

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        timezone: user.timezone,
        preferences: user.preferences
      },
      token,
      refreshToken
    }
  });
});

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  // Check for user
  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    });
    return;
  }

  // Check password
  const isMatch = await bcrypt.compare(password, user.password!);
  if (!isMatch) {
    res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    });
    return;
  }

  const userId = typeof user._id === 'string' ? user._id : user._id?.toString?.();
  if (!userId) {
    res.status(500).json({
      success: false,
      message: 'User ID is invalid'
    });
    return;
  }

  const token = generateToken(userId);
  const refreshToken = generateRefreshToken(userId);

  // Add refresh token to user
  user.refreshTokens.push(refreshToken);
  user.lastLoginAt = new Date();
  await user.save();

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        timezone: user.timezone,
        preferences: user.preferences
      },
      token,
      refreshToken
    }
  });
});

// @desc    Refresh token
// @route   POST /api/auth/refresh
// @access  Public
export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    res.status(401).json({
      success: false,
      message: 'Refresh token required'
    });
    return;
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as { userId: string };
    const user = await User.findById(decoded.userId);

    if (!user || !user.refreshTokens.includes(refreshToken)) {
      res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
      return;
    }

    const userId = typeof user._id === 'string' ? user._id : user._id?.toString?.();
    if (!userId) {
      res.status(500).json({
        success: false,
        message: 'User ID is invalid'
      });
      return;
    }

    const newToken = generateToken(userId);
    const newRefreshToken = generateRefreshToken(userId);

    // Remove old refresh token and add new one
    user.refreshTokens = user.refreshTokens.filter((token: string) => token !== refreshToken);
    user.refreshTokens.push(newRefreshToken);
    await user.save();

    res.json({
      success: true,
      data: {
        token: newToken,
        refreshToken: newRefreshToken
      }
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid refresh token'
    });
  }
});

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
export const getMe = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({
    success: true,
    data: {
      user: req.user
    }
  });
});

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
export const logout = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { refreshToken } = req.body;

  if (refreshToken && req.user) {
    // Remove refresh token
    req.user.refreshTokens = req.user.refreshTokens.filter((token: string) => token !== refreshToken);
    await req.user.save();
  }

  res.json({
    success: true,
    message: 'Logout successful'
  });
});

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
export const updateProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name, timezone, preferences } = req.body;

  const user = await User.findByIdAndUpdate(
    req.user!._id,
    {
      ...(name && { name }),
      ...(timezone && { timezone }),
      ...(preferences && { preferences: { ...req.user!.preferences, ...preferences } })
    },
    { new: true, runValidators: true }
  );

  res.json({
    success: true,
    message: 'Profile updated successfully',
    data: {
      user
    }
  });
});

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
export const changePassword = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user!._id).select('+password');

  // Check current password
  const isMatch = await bcrypt.compare(currentPassword, user!.password!);
  if (!isMatch) {
    res.status(400).json({
      success: false,
      message: 'Current password is incorrect'
    });
    return;
  }

  // Hash new password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(newPassword, salt);

  user!.password = hashedPassword;
  await user!.save();

  res.json({
    success: true,
    message: 'Password changed successfully'
  });
});

// Google OAuth Client
const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.FRONTEND_URL || 'http://localhost:8080'}/auth/google/callback`
);

// @desc    Get Google OAuth URL
// @route   GET /api/auth/google/url
// @access  Public
export const getGoogleAuthUrl = asyncHandler(async (req: Request, res: Response) => {
  const scopes = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events'
  ];

  const authUrl = googleClient.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });

  res.json({
    success: true,
    authUrl
  });
});

// @desc    Handle Google OAuth callback
// @route   POST /api/auth/google/callback
// @access  Public
export const handleGoogleCallback = asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.body;

  if (!code) {
    res.status(400).json({
      success: false,
      message: 'Authorization code is required'
    });
    return;
  }

  try {
    // Exchange code for tokens
    const { tokens } = await googleClient.getToken(code);
    googleClient.setCredentials(tokens);

    // Get user info from Google
    const response = await googleClient.request({
      url: 'https://www.googleapis.com/oauth2/v2/userinfo'
    });

    const googleUser = response.data as any;
    const { email, name, picture } = googleUser;

    if (!email) {
      res.status(400).json({
        success: false,
        message: 'Unable to get email from Google'
      });
      return;
    }

    // Check if user already exists
    let user = await User.findOne({ email });

    if (user) {
      // User exists, update their Google info if needed
      if (!user.googleId) {
        user.googleId = googleUser.id;
        user.avatar = picture;
        await user.save();
      }
    } else {
      // Create new user
      user = await User.create({
        name: name || 'Google User',
        email,
        googleId: googleUser.id,
        avatar: picture,
        isEmailVerified: true,
        timezone: 'UTC'
      });
    }

    // Generate JWT tokens
    const userId = typeof user._id === 'string' ? user._id : user._id?.toString?.();
    if (!userId) {
      res.status(500).json({
        success: false,
        message: 'User ID is invalid'
      });
      return;
    }

    const token = generateToken(userId);
    const refreshToken = generateRefreshToken(userId);

    // Add refresh token to user
    user.refreshTokens = user.refreshTokens || [];
    user.refreshTokens.push(refreshToken);
    await user.save();

    res.json({
      success: true,
      message: 'Google authentication successful',
      data: {
        token,
        refreshToken,
        user: {
          id: userId,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          isEmailVerified: user.isEmailVerified
        }
      }
    });
  } catch (error) {
    console.error('Google OAuth error:', error);
    res.status(400).json({
      success: false,
      message: 'Google authentication failed'
    });
  }
});

// @desc    Verify Google ID token
// @route   POST /api/auth/google/verify
// @access  Public
export const verifyGoogleToken = asyncHandler(async (req: Request, res: Response) => {
  const { idToken } = req.body;

  if (!idToken) {
    res.status(400).json({
      success: false,
      message: 'ID token is required'
    });
    return;
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    if (!payload) {
      res.status(400).json({
        success: false,
        message: 'Invalid ID token'
      });
      return;
    }

    const { email, name, picture, sub } = payload;

    if (!email) {
      res.status(400).json({
        success: false,
        message: 'Unable to get email from Google token'
      });
      return;
    }

    // Check if user exists
    let user = await User.findOne({ email });

    if (user) {
      // Update Google info if needed
      if (!user.googleId) {
        user.googleId = sub;
        user.avatar = picture;
        await user.save();
      }
    } else {
      // Create new user
      user = await User.create({
        name: name || 'Google User',
        email,
        googleId: sub,
        avatar: picture,
        isEmailVerified: true,
        timezone: 'UTC'
      });
    }

    // Generate JWT tokens
    const userId = typeof user._id === 'string' ? user._id : user._id?.toString?.();
    if (!userId) {
      res.status(500).json({
        success: false,
        message: 'User ID is invalid'
      });
      return;
    }

    const token = generateToken(userId);
    const refreshToken = generateRefreshToken(userId);

    // Add refresh token to user
    user.refreshTokens = user.refreshTokens || [];
    user.refreshTokens.push(refreshToken);
    await user.save();

    res.json({
      success: true,
      message: 'Google authentication successful',
      data: {
        token,
        refreshToken,
        user: {
          id: userId,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          isEmailVerified: user.isEmailVerified
        }
      }
    });
  } catch (error) {
    console.error('Google token verification error:', error);
    res.status(400).json({
      success: false,
      message: 'Google token verification failed'
    });
  }
});
