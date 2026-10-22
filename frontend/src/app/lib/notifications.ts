import { API_BASE_URL } from "./apiConfig";
const BASE_URL = API_BASE_URL;

export interface AppNotification {
  id: string;
  user_id: number;
  title: string;
  message: string;
  notification_type: string;
  link?: string | null;
  is_read: boolean;
  created_at: string;
}

export async function fetchNotifications(token: string): Promise<AppNotification[]> {
  const res = await fetch(`${BASE_URL}/notifications`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error("Failed to fetch notifications");
  }
  const data = await res.json();
  return Array.isArray(data) ? data : (data.notifications ?? []);
}

export async function markNotificationRead(token: string, notificationId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/notifications/${notificationId}/read`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error("Failed to mark notification as read");
  }
}

export async function markAllNotificationsRead(token: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/notifications/read-all`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error("Failed to mark all notifications as read");
  }
}
