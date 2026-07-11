import React, { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { connectRealtime, disconnectRealtime } from './socket';

export default function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (status !== 'authenticated' || !user) {
      disconnectRealtime();
      return undefined;
    }

    const socket = connectRealtime();
    const refreshChats = () => queryClient.invalidateQueries({ queryKey: ['chats'] });
    const refreshNotifications = () => {
      queryClient.invalidateQueries({ queryKey: ['notification-center'] });
      queryClient.invalidateQueries({ queryKey: ['account-notifications'] });
    };
    const refreshQuotations = () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: ['rfqs'] });
    };
    const refreshOrders = () => queryClient.invalidateQueries({ queryKey: ['orders'] });

    socket.on('new_message', refreshChats);
    socket.on('conversation_updated', refreshChats);
    socket.on('new_notification', refreshNotifications);
    socket.on('quotation_updated', refreshQuotations);
    socket.on('rfq_updated', refreshQuotations);
    socket.on('order_updated', refreshOrders);

    return () => {
      socket.off('new_message', refreshChats);
      socket.off('conversation_updated', refreshChats);
      socket.off('new_notification', refreshNotifications);
      socket.off('quotation_updated', refreshQuotations);
      socket.off('rfq_updated', refreshQuotations);
      socket.off('order_updated', refreshOrders);
      disconnectRealtime();
    };
  }, [queryClient, status, user]);

  return <>{children}</>;
}
