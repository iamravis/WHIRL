# Tutorial: User Registration and JWT Login with Django REST Framework and Next.js

This tutorial explains the user authentication process implemented in this project, covering user registration and JWT-based login, including both the backend API (Django REST Framework) and frontend integration examples (Next.js).

## 1. User Registration: Backend (Django REST Framework)

The backend handles receiving registration data, validating it, creating the user and their profile, and sending back a response.

### a. Models (`backend/api/models.py`)

Two main models are involved:

-   **`django.contrib.auth.models.User`**: Django's built-in user model handles core authentication fields like `username`, `email`, `password`, `first_name`, `last_name`.
-   **`api.models.UserProfile`**: A custom model linked one-to-one with the `User` model to store additional application-specific information:
    -   `user`: Foreign key to the `User` model.
    -   `institution`: `CharField` for the user's institution.
    -   `role`: `CharField` with predefined choices (e.g., 'OB', 'MW') using `models.TextChoices` for internal storage, but mapped from full names (e.g., "Obstetrician") during input.

    ```python
    # backend/api/models.py (Relevant parts)
    from django.db import models
    from django.conf import settings # To get AUTH_USER_MODEL

    class UserProfile(models.Model):
        user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='profile')
        institution = models.CharField(max_length=255, blank=True, null=True)

        class Role(models.TextChoices):
            OBSTETRICIAN = 'OB', 'Obstetrician'
            MIDWIFE = 'MW', 'Midwife'
            NURSE = 'NU', 'Nurse'
            GP = 'GP', 'GP'
            # Add more roles here if needed

        role = models.CharField(
            max_length=2,
            choices=Role.choices,
            blank=True,
            null=True
        )
        # ... other fields and methods
    ```

### b. Serializer (`backend/api/serializers.py`)

The `UserSerializer` is responsible for converting the incoming JSON data for registration into Python objects, validating the data, and handling the creation of the `User` and `UserProfile` instances.

-   **Input Fields**: Defines fields expected from the API request (`full_name`, `email`, `password`, `institution`, `role`). `role` is a `CharField` accepting the full name.
-   **`validate_email`**: Ensures email uniqueness.
-   **`validate_role`**: Converts the full role name (e.g., "Obstetrician") to its internal code (e.g., 'OB').
-   **`create`**: Handles `User` and `UserProfile` creation, username generation, and name splitting.

```python
# backend/api/serializers.py (Relevant parts)
from django.contrib.auth.models import User
from rest_framework import serializers
from .models import UserProfile
import uuid

class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(max_length=100, write_only=True)
    institution = serializers.CharField(max_length=255, required=False, allow_blank=True, write_only=True)
    # Accepts full role name, validated by validate_role
    role = serializers.CharField(max_length=50, required=False, allow_blank=True, write_only=True)
    profile = UserProfileSerializer(read_only=True) # For displaying profile info if needed

    class Meta:
        model = User
        fields = ('id', 'email', 'password', 'full_name', 'institution', 'role', 'first_name', 'last_name', 'profile')
        # ... extra_kwargs

    def validate_email(self, value):
        # ... (validation logic)

    def validate_role(self, value):
        if not value: return None
        role_map = {label.lower(): val for val, label in UserProfile.Role.choices}
        role_code = role_map.get(value.lower())
        if not role_code:
            valid_roles = [label for _, label in UserProfile.Role.choices]
            raise serializers.ValidationError(f"Invalid role '{value}'. Valid roles are: {', '.join(valid_roles)}")
        return role_code # Return internal code like 'OB'

    def create(self, validated_data):
        profile_data = {
            'institution': validated_data.pop('institution', None),
            'role': validated_data.pop('role', None) # Contains the validated code ('OB')
        }
        full_name = validated_data.pop('full_name')
        # ... (username generation, name splitting)
        user = User.objects.create_user(
            # ... user fields
        )
        if profile_data['institution'] or profile_data['role']:
             UserProfile.objects.create(user=user, **profile_data)
        return user
```

### c. View (`backend/api/views.py`)

The `register_user` view function handles the incoming `POST` request for registration.

-   `@api_view(['POST'])`, `@permission_classes([AllowAny])`: Allows unauthenticated POST requests.
-   Uses `UserSerializer` to validate and save the user.
-   Returns `201 CREATED` on success or `400 BAD REQUEST` with errors.

```python
# backend/api/views.py
from rest_framework import status
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from .serializers import UserSerializer

@api_view(['POST'])
@permission_classes([AllowAny])
def register_user(request):
    if request.method == 'POST':
        serializer = UserSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        else:
            # Log validation errors for debugging (optional)
            print("VALIDATION ERRORS:", serializer.errors)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

```

### d. URLs (`backend/api/urls.py` and `backend/core/urls.py`)

-   The registration endpoint is defined as `/api/auth/register/`.

## 2. User Registration: Frontend (Next.js Example)

This example shows a basic Next.js component for a registration form.

```jsx
// Example: components/RegistrationForm.js
import React, { useState } from 'react';

function RegistrationForm() {
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    institution: '',
    role: '', // Store the full role name selected by the user
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState(null);

  // Define available roles based on backend model choices (display names)
  const availableRoles = [
      'Obstetrician',
      'Midwife',
      'Nurse',
      'GP',
      // Add other roles matching the labels in UserProfile.Role
  ];

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setError(null);

    // Ensure your Django backend is running and accessible
    // Use environment variables for API URLs in real projects
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

    try {
      const response = await fetch(`${apiUrl}/api/auth/register/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData), // Send the form data as JSON
      });

      const data = await response.json();

      if (response.ok) { // Status code 200-299
        setMessage(`Registration successful! User ID: ${data.id}, Email: ${data.email}`);
        // Optionally redirect user or clear form
        setFormData({ full_name: '', email: '', password: '', institution: '', role: '' });
      } else {
        // Handle validation errors (response.status === 400) or other errors
        console.error('Registration failed:', data);
        // Construct a user-friendly error message
        let errorMsg = `Registration failed (Status: ${response.status}).`;
        if (data && typeof data === 'object') {
            // Display validation errors from the serializer
            const errors = Object.entries(data).map(([field, messages]) =>
                `${field}: ${Array.isArray(messages) ? messages.join(', ') : messages}`
            ).join('; ');
            errorMsg += ` Details: ${errors}`;
        }
        setError(errorMsg);
      }
    } catch (err) {
      console.error('Network or other error:', err);
      setError('An error occurred during registration. Please try again.');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Register</h2>
      {message && <p style={{ color: 'green' }}>{message}</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <div>
        <label>Full Name:</label>
        <input type="text" name="full_name" value={formData.full_name} onChange={handleChange} required />
      </div>
      <div>
        <label>Email:</label>
        <input type="email" name="email" value={formData.email} onChange={handleChange} required />
      </div>
      <div>
        <label>Password:</label>
        <input type="password" name="password" value={formData.password} onChange={handleChange} required />
      </div>
      <div>
        <label>Institution (Optional):</label>
        <input type="text" name="institution" value={formData.institution} onChange={handleChange} />
      </div>
       <div>
        <label>Role (Optional):</label>
        <select name="role" value={formData.role} onChange={handleChange}>
            <option value="">-- Select Role --</option>
            {availableRoles.map(roleName => (
                <option key={roleName} value={roleName}>{roleName}</option>
            ))}
        </select>
      </div>

      <button type="submit">Register</button>
    </form>
  );
}

export default RegistrationForm;

```

**Key Frontend Points (Registration):**

-   Sends a `POST` request to `/api/auth/register/`.
-   Sends form data including the full role name.
-   Handles success and displays validation errors from the backend.

## 3. Understanding JWT (JSON Web Tokens)

Before implementing login, it's essential to understand JWT, the mechanism we're using to handle user sessions after they log in.

### a. What is JWT?

JWT (JSON Web Token) is an open standard (RFC 7519) for securely transmitting information between parties as a JSON object. This information can be verified and trusted because it is digitally signed. JWTs are often used for:

-   **Authorization**: Once a user is logged in, subsequent requests can include the JWT, allowing the user to access routes, services, and resources permitted for that token.
-   **Information Exchange**: JWTs can be used to securely transmit information between parties.

### b. JWT Structure

A JWT typically consists of three parts separated by dots (`.`):

1.  **Header**: Contains metadata about the token, such as the type of token (JWT) and the signing algorithm being used (e.g., HMAC SHA256 or RSA).
    `{"alg": "HS256", "typ": "JWT"}` (Example)
2.  **Payload**: Contains the "claims". Claims are statements about an entity (typically, the user) and additional data. There are registered claims (e.g., `iss` - issuer, `exp` - expiration time, `sub` - subject), public claims, and private claims (custom claims agreed upon by the parties). **Important:** The payload is Base64Url encoded, *not* encrypted, so don't put sensitive information here unless the token itself is transmitted over HTTPS.
    `{"user_id": 123, "username": "john.doe", "exp": 1678886400}` (Example)
3.  **Signature**: To create the signature, you take the encoded header, the encoded payload, a secret key, specify the algorithm declared in the header, and sign that. The signature is used to verify that the sender of the JWT is who it says it is and to ensure that the message wasn't changed along the way.
    `HMACSHA256(base64UrlEncode(header) + "." + base64UrlEncode(payload), secret)` (Conceptual Example)

The final token looks like: `xxxxx.yyyyy.zzzzz`

### c. How it Works (Stateless Authentication)

1.  User logs in with credentials (username/password).
2.  Server verifies credentials.
3.  Server creates a JWT (signing it with a secret key) and sends it back to the client.
4.  Client stores the JWT (e.g., in localStorage, sessionStorage, or memory).
5.  For subsequent requests to protected routes, the client includes the JWT in the `Authorization` header (`Bearer xxxxx.yyyyy.zzzzz`).
6.  Server receives the request, extracts the JWT from the header.
7.  Server verifies the JWT's signature using the *same secret key*. If the signature is valid and the token hasn't expired, the server trusts the claims in the payload (e.g., the `user_id`) and processes the request.

This is **stateless** because the server doesn't need to store session information in its database or memory. All the necessary info (like user ID and expiration) is in the token itself, which the server can verify on each request.

### d. Access Tokens vs. Refresh Tokens

`djangorestframework-simplejwt` (and common JWT practice) uses two types of tokens:

-   **Access Token**: Short-lived token (e.g., 15-60 minutes) included in the `Authorization` header of requests to access protected resources. Its short lifespan limits the damage if it's compromised.
-   **Refresh Token**: Longer-lived token (e.g., hours, days, or weeks) used solely to obtain a new access token when the current one expires. It's sent to a specific refresh endpoint. This avoids requiring the user to log in frequently. Refresh tokens should be stored more securely if possible (e.g., in an HttpOnly cookie managed by the browser, although localStorage is common for simplicity).

## 4. User Login: Backend (Django REST Framework with Simple JWT)

We use the `djangorestframework-simplejwt` library to handle JWT generation and verification.

### a. Installation

The library was added to `requirements.txt` and installed:

```bash
pip install djangorestframework-simplejwt
# (Already done in previous steps)
```

### b. Settings (`backend/core/settings.py`)

Several configurations were added/updated:

-   **`INSTALLED_APPS`**: Added `'rest_framework_simplejwt'` (and potentially `'rest_framework_simplejwt.token_blacklist'` if using blacklisting).
-   **`REST_FRAMEWORK`**: Configured `'DEFAULT_AUTHENTICATION_CLASSES'` to use `rest_framework_simplejwt.authentication.JWTAuthentication` as the primary method. `'DEFAULT_PERMISSION_CLASSES'` often defaults to `IsAuthenticated`, requiring a valid token for most views unless overridden.
-   **`SIMPLE_JWT`**: A dictionary defining token lifetimes (`ACCESS_TOKEN_LIFETIME`, `REFRESH_TOKEN_LIFETIME`), the signing algorithm (`ALGORITHM`), the signing key (`SIGNING_KEY` - defaults to Django's `SECRET_KEY`), expected header type (`AUTH_HEADER_TYPES` - typically `'Bearer'`), and other JWT-related settings.

```python
# backend/core/settings.py (Relevant additions)

INSTALLED_APPS = [
    # ... other apps
    'rest_framework',
    'corsheaders',
    'rest_framework_simplejwt', # Added
    'api',
]

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication', # Added
        # Other auth classes if needed
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated', # Default: require login
    )
}

from datetime import timedelta

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60), # Example: 1 hour
    'REFRESH_TOKEN_LIFETIME': timedelta(days=1),    # Example: 1 day
    'AUTH_HEADER_TYPES': ('Bearer',),
    # ... other SIMPLE_JWT settings
}
```

### c. Customization for Email Login (Backend)

By default, Simple JWT uses the `username` field for login. Since we want to use the user's `email` address, we made the following backend customizations:

1.  **Custom Serializer (`api/serializers.py`)**: We created `MyTokenObtainPairSerializer` inheriting from `TokenObtainPairSerializer` and set `username_field = User.EMAIL_FIELD`. This tells the serializer to look for an `email` key in the request data and validate it against the `User` model's email field.

    ```python
    # backend/api/serializers.py
    from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
    from django.contrib.auth.models import User

    class MyTokenObtainPairSerializer(TokenObtainPairSerializer):
        username_field = User.EMAIL_FIELD
    ```

2.  **Custom View (`api/views.py`)**: We created `MyTokenObtainPairView` inheriting from `TokenObtainPairView` and set `serializer_class = MyTokenObtainPairSerializer`. This tells the view to use our custom serializer for processing login requests.

    ```python
    # backend/api/views.py
    from rest_framework_simplejwt.views import TokenObtainPairView
    from .serializers import MyTokenObtainPairSerializer

    class MyTokenObtainPairView(TokenObtainPairView):
        serializer_class = MyTokenObtainPairSerializer
    ```

3.  **URL Update (`api/urls.py`)**: We updated the `/api/auth/login/` path to use our `MyTokenObtainPairView` instead of the default one.

    ```python
    # backend/api/urls.py 
    from .views import MyTokenObtainPairView
    # ... other imports

    urlpatterns = [
        # ... other paths
        path('auth/login/', MyTokenObtainPairView.as_view(), name='token_obtain_pair'), 
        path('auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    ]
    ```

### d. URLs (`backend/api/urls.py`)

Simple JWT provides views for obtaining and refreshing tokens. These, along with our custom login view, were added to the URL patterns:

-   **`MyTokenObtainPairView` (Custom)**: Mapped to `/api/auth/login/`. Takes `email` and `password` via POST, validates them, and returns an access/refresh token pair if successful.
-   **`TokenRefreshView`**: Mapped to `/api/auth/token/refresh/`. This view takes a `refresh` token via POST and returns a new `access` token if the refresh token is valid.

```python
# backend/api/urls.py (Relevant additions)
# Imports including MyTokenObtainPairView and TokenRefreshView
# ...

urlpatterns = [
    path('auth/register/', views.register_user, name='register'),
    # JWT Authentication endpoints
    path('auth/login/', MyTokenObtainPairView.as_view(), name='token_obtain_pair'), # Using custom view
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'), 
    # Other paths...
]
```

## 5. User Login: Frontend (Next.js Example)

This example shows a `LoginForm` component adapted to call our email-based login endpoint.

```jsx
// Example: components/LoginForm.js (or src/app/auth/signin/page.tsx)
import React, { useState } from 'react';
// ... other imports like useRouter

// Assume an auth context or state management solution exists
// ... (comments as before)

function LoginForm() {
  const [email, setEmail] = useState(''); // Using email state
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  // ... (context examples)

  const handleSubmit = async (e) => {
    e.preventDefault();
    // ... (loading/error reset)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

    try {
      const response = await fetch(`${apiUrl}/api/auth/login/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        // Send email and password to the backend
        body: JSON.stringify({ email, password }), 
      });

      const data = await response.json();

      if (response.ok) {
        console.log('Login Successful:', data);
        // Store tokens (Example: localStorage)
        localStorage.setItem('access_token', data.access);
        localStorage.setItem('refresh_token', data.refresh);
        // ... (update global state, redirect)
      } else {
         // ... (error handling as before) ...
      }
    } catch (err) {
        // ... (network/other error handling as before) ...
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Login</h2>
      {/* ... Error display ... */}
      <div>
        <label htmlFor="email">Email address:</label>
        <input
          id="email"
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          // ... other attributes
        />
      </div>
      <div>
        <label htmlFor="password">Password:</label>
        <input
          id="password"
          type="password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          // ... other attributes
        />
      </div>
      <button type="submit" disabled={loading}>
        {/* ... Loading state ... */}
      </button>
    </form>
  );
}

export default LoginForm;
```

**Key Frontend Points (Login & JWT Handling):**

1.  **Credentials**: Send `email` and `password` to `/api/auth/login/`.
2.  **Token Storage**: On successful login, receive `access` and `refresh` tokens. Store them securely (e.g., `localStorage`, context, etc.).
3.  **Authenticated Requests**: Retrieve the `access_token` and include it in the `Authorization: Bearer <token>` header for protected requests.
4.  **Token Refresh**: When an API request fails with a 401 Unauthorized status (indicating an expired or invalid access token), use the stored `refresh_token` to call the `/api/auth/token/refresh/` endpoint. If successful, store the new `access_token` received and retry the original API request. If the refresh fails (e.g., refresh token also expired), log the user out. This logic is often implemented in a utility function or Axios interceptor.

## 6. Fetching User Profile Data (Backend & Frontend)

Once logged in, the frontend needs to know details about the user (name, email, etc.) to personalize the UI.

### a. Backend (`/api/profile/me/`)

-   **View (`api/views.py`)**: A `UserProfileView` (subclassing `RetrieveAPIView`) was created.
    -   It uses `permission_classes = [IsAuthenticated]` to ensure only logged-in users can access it.
    -   Its `get_object` method simply returns `self.request.user`, which is automatically populated by the `JWTAuthentication` backend based on the valid token provided in the request header.
-   **Serializer (`api/serializers.py`)**: A `UserProfileDetailSerializer` was created to define the structure of the returned data, including fields from the `User` model and the nested `UserProfile` model (`id`, `username`, `email`, `first_name`, `last_name`, `profile: {institution, role}`).
-   **URL (`api/urls.py`)**: The path `profile/me/` was added and mapped to `views.UserProfileView.as_view()`.

### b. Frontend (`src/app/page.tsx`)

-   **State**: A `userInfo` state variable was added to hold the fetched profile data.
-   **Authentication Check (`useEffect`)**: The main `useEffect` hook that checks for the `access_token` in `localStorage` was modified:
    -   If a token exists, it calls an async function `fetchUserProfile`.
    -   `fetchUserProfile` makes a `GET` request to `/api/profile/me/`, including the `Authorization: Bearer <token>` header.
    -   On success (200 OK), it parses the JSON response and updates the `userInfo` state.
    -   On failure (e.g., 401 Unauthorized, indicating an invalid/expired token), it currently calls `handleLogout` (token refresh logic to be added later).
    -   If the token fetch succeeds, `authStatus` is set to `'authenticated'`; otherwise, it's set to `'unauthenticated'`.
-   **UI Update**: Components like the user profile dropdown and the welcome message were updated to display data from the `userInfo` state instead of the removed `useSession` data.
-   **Logout (`handleLogout`)**: A function was added to remove the `access_token` and `refresh_token` from `localStorage`, clear the `userInfo` state, set `authStatus` to `'unauthenticated'`, and redirect the user to the sign-in page.

```typescript
// Simplified useEffect logic in src/app/page.tsx

const [authStatus, setAuthStatus] = useState('loading');
const [userInfo, setUserInfo] = useState(null);

useEffect(() => {
  const token = localStorage.getItem('access_token');
  if (token) {
    fetchUserProfile(token); // Call async function
  } else {
    setAuthStatus('unauthenticated');
  }
}, []);

async function fetchUserProfile(token) {
  try {
    const response = await fetch('/api/profile/me/', { /* ... headers with token ... */ });
    if (response.ok) {
      const userData = await response.json();
      setUserInfo(userData); // Or map fields as needed
      setAuthStatus('authenticated');
    } else if (response.status === 401) {
      // TODO: Handle token refresh
      handleLogout();
    } else {
      setAuthStatus('unauthenticated');
    }
  } catch (error) {
    setAuthStatus('unauthenticated');
  }
}

function handleLogout() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  setAuthStatus('unauthenticated');
  setUserInfo(null);
  router.push('/auth/signin');
}
```

## 7. Combined Authentication Flow

1.  **Registration**: User submits registration form -> Next.js POSTs to `/api/auth/register/` -> Django validates -> `UserSerializer` creates `User` & `UserProfile` -> Django returns success/error -> Next.js displays message.
2.  **Login**: User submits login form -> Next.js POSTs credentials to `/api/auth/login/` -> Django (Simple JWT's `TokenObtainPairView`) validates -> Returns `access` and `refresh` tokens (or 401 error) -> Next.js stores tokens and updates auth state.
3.  **Authenticated Request**: Next.js component needs data -> Retrieves `access_token` -> Makes `fetch` request with `Authorization: Bearer <token>` header -> Django verifies JWT -> Processes request if valid -> Returns data.
4.  **Token Expiry & Refresh**: Authenticated request fails (401) -> Next.js uses `refresh_token` to POST to `/api/auth/token/refresh/` -> Django (`TokenRefreshView`) validates refresh token -> Returns new `access_token` -> Next.js stores new token and retries original request. If refresh fails, log user out.

## 8. Security Considerations & Next Steps

-   **Token Storage**: Carefully consider the security trade-offs of different client-side storage mechanisms (localStorage vs. HttpOnly cookies vs. in-memory).
-   **HTTPS**: Always use HTTPS in production to protect tokens and data in transit.
-   **Token Lifespans**: Choose appropriate lifetimes for access and refresh tokens based on your security requirements.
-   **Refresh Token Rotation**: Consider enabling `ROTATE_REFRESH_TOKENS` in `SIMPLE_JWT` settings for added security (each refresh request issues a new refresh token), but this requires more complex client-side handling.
-   **Token Blacklisting**: Implement token blacklisting (requires adding `'rest_framework_simplejwt.token_blacklist'` to `INSTALLED_APPS` and running migrations) if you need the ability to invalidate tokens immediately (e.g., on password change or explicit logout). Stateless JWT doesn't inherently support instant invalidation without a blacklist.
-   **Logout**: Implement a logout mechanism on the frontend that simply removes the stored tokens. If using blacklisting, also send the refresh token to a backend endpoint to add it to the blacklist.
-   **CSRF**: If using cookies for token storage, ensure proper CSRF protection is in place.
-   **Password Strength/Email Verification**: Enhance registration with these features.

This tutorial covers the fundamentals of registration and JWT login. Remember to adapt the frontend examples to your specific state management solution and consider the security implications thoroughly.