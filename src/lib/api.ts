import { getCookie, setCookie } from 'cookies-next';

interface ApiError extends Error {
  status?: number
}

export async function handleApiResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error: ApiError = new Error('API request failed')
    error.status = response.status

    try {
      const data = await response.json()
      error.message = data.error || 'An unexpected error occurred'
    } catch {
      error.message = `HTTP error! status: ${response.status}`
    }

    throw error
  }

  return response.json()
}

export async function fetchApi<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  return handleApiResponse<T>(response)
}

// Helper function to get tokens from localStorage
const getAuthTokens = () => {
  if (typeof window === 'undefined') return { access: null, refresh: null };
  const accessToken = localStorage.getItem('access_token');
  const refreshToken = localStorage.getItem('refresh_token');
  return { access: accessToken, refresh: refreshToken };
};

// Helper function to set access token
const setAccessToken = (token: string) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('access_token', token);
  }
};

// Helper function to trigger logout (avoids importing router here)
const handleLogout = () => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    // Redirect to signin page - use window.location for simplicity in this utility
    // Or pass a logout callback function if more complex state cleanup is needed
    window.location.href = '/auth/signin'; 
  }
};

// Function to attempt token refresh
const refreshToken = async (): Promise<string | null> => {
  const refreshToken = getCookie('refresh_token');
  if (!refreshToken) {
    console.error("Refresh token not found.");
    return null;
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
  try {
    const response = await fetch(`${apiUrl}/api/auth/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: refreshToken }),
    });

    if (response.ok) {
      const data = await response.json();
      const newAccessToken = data.access;
      if (newAccessToken) {
        setCookie('access_token', newAccessToken);
        console.log("Token refreshed successfully.");
        return newAccessToken;
      } else {
        console.error("Refresh response missing access token.");
        return null;
      }
    } else {
      console.error("Token refresh failed:", response.status);
      return null;
    }
  } catch (error) {
    console.error("Error during token refresh request:", error);
    return null;
  }
};

// The main fetch wrapper function
export const fetchWithAuth = async (
  url: string, 
  options: RequestInit = {}
): Promise<Response> => {
  // Get the access token from cookies
  const token = getCookie('access_token');
  
  // Create a new headers object with the Authorization header
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  // Create the request with the updated headers
  const request = new Request(url, {
    ...options,
    headers
  });
  
  // Make the request
  const response = await fetch(request);
  
  // Handle 401 Unauthorized (token expired)
  if (response.status === 401) {
    // Try to refresh the token
    const newToken = await refreshToken();
    
    // If token refresh was successful, retry the request with the new token
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`);
      
      return fetch(new Request(url, {
        ...options,
        headers
      }));
    }
  }
  
  return response;
}; 