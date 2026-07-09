import { setSessionCookie, clearSessionCookie, getCurrentUser } from '../lib/session.js';
import * as authService from '../services/auth.service.js';

export async function login(req, res, next) {
  try {
    const result = await authService.loginUser(req.body.email, req.body.password);

    // Set session cookie with user ID
    setSessionCookie(res, result.user.id);

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
    setSessionCookie(res, result.user.id);

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

export async function getMe(req, res) {
  const user = await getCurrentUser(req);

  if (!user) {
    return res.status(401).json({ user: null });
  }

  return res.json({ user });
}
