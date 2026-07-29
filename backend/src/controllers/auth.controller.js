import { setSessionCookie, clearSessionCookie, getCurrentUser } from '../lib/session.js';
import * as authService from '../services/auth.service.js';
import * as passwordResetService from '../services/password-reset.service.js';

export async function login(req, res, next) {
  try {
    const result = await authService.loginUser(req.body.email, req.body.password);

    // Set session cookie with user ID
    setSessionCookie(res, result.user.id, result.user.sessionVersion);

    return res.json({
      user: result.user,
      redirectTo: result.redirectTo,
    });
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(422).json({
        error: 'Please enter a valid email and password',
      });
    }

    if (error.statusCode === 401) {
      return res.status(401).json({
        error: error.message,
      });
    }

    next(error);
  }
}

export async function signup(req, res, next) {
  try {
    const result = await authService.signupUser(req.body);

    // Set session cookie with new user ID
    setSessionCookie(res, result.user.id, result.user.sessionVersion);

    return res.status(201).json({
      user: result.user,
      redirectTo: result.redirectTo,
    });
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(422).json({
        error: 'Please check your signup details',
      });
    }

    if (error.code === 11000 || error.statusCode === 409) {
      return res.status(409).json({
        error: 'An account already exists with this email',
      });
    }

    next(error);
  }
}

export async function logout(req, res) {
  clearSessionCookie(res);
  return res.json({ success: true });
}

export async function refresh(req, res, next) {
  try {
    const user = await getCurrentUser(req);

    if (!user) {
      return res.status(401).json({ user: null });
    }

    setSessionCookie(res, user.id, user.sessionVersion);
    return res.json({ user });
  } catch (error) {
    return next(error);
  }
}

export async function getMe(req, res, next) {
  try {
    const user = await getCurrentUser(req);

    if (!user) {
      return res.status(401).json({ user: null });
    }

    return res.json({ user });
  } catch (error) {
    return next(error);
  }
}

const requestMetadata = req => ({
  ipAddress: req.ip,
  userAgent: req.get('user-agent') || '',
});

export async function forgotPassword(req, res, next) {
  try {
    const result = await passwordResetService.requestOtp({ ...req.body, ...requestMetadata(req) });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(202).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function verifyPasswordResetOtp(req, res, next) {
  try {
    const result = await passwordResetService.verifyOtp(req.body);
    res.setHeader('Cache-Control', 'no-store');
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

export async function resetPassword(req, res, next) {
  try {
    const result = await passwordResetService.resetPassword(req.body);
    clearSessionCookie(res);
    res.setHeader('Cache-Control', 'no-store');
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}
