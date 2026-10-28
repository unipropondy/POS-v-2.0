import axios from 'axios';
import { API_URL } from '@/constants/Config';
import { useAuthStore } from './stores/authStore';

const API = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Automatically attach the JWT token & company code to every outgoing request
API.interceptors.request.use(
  (config) => {
    const authState = useAuthStore.getState();
    const token = authState?.token;
    const companyCode = authState?.user?.companyCode;

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (companyCode && !config.headers["X-Company-Code"]) {
      config.headers["X-Company-Code"] = String(companyCode).trim();
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default API;