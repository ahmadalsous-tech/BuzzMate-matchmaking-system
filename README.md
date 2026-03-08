![logo-HINK5](https://github.com/user-attachments/assets/87780418-2f1e-4970-9609-5da54b4a89a3)

**System purpose (in-scope only):** a simple matchmaking app that supports:

- Registration
    
- Weekly Match generation (based on user preferences + swipes)
    
- Mutual like → automatic date scheduling (using Google Calendar +Preferences)
    
- Messaging between matched users
    
- Reporting, blocking, and banning (report_count + account_status)
**Client UI:** Mobile App with 5 pages: **Calendar, Chats, Discover, Preferences,Profile**  
**External systems (fixed scope):** **Google Calendar API**,OPTIONAL: **Google Maps API**  
**Data layer:** relational database with the provided tables.
  
## $\color{purple}{\text{ARCHITECTURE}}$

### Client–Server
single backend deployment
#### Frontend (Mobile App)-> essentially the client

- **Discover page:** fetch candidates; send swipe actions (like/dislike).
    
- **Preferences page:** create/update Preferences filters.
    
- **Chats page:** list conversations; send/receive messages.
    
- **Calendar page:** view scheduled/accepted dates (derived from stored suggestions and calendar integration status).
    
- **Profile page:** register/update user fields (name, age, occupation, etc.).
    

#### Backend (modular services)-> the services that the server hosts

1. **User Service**
    
    - Registration and profile updates
        
    - Enforces account_status (active/banned)
        
2. **Preferences Service**
    
    - CRUD for Preferences
        
    - Provides filters for candidate selection
        
3. **Interaction & Match Service**
    
    - Records swipes in **Interactions**
        
    - Detects mutual like → writes **Matches**
        
    - Triggers one-time date suggestion creation in **Suggested_Dates**
        
4. **Date Scheduling Service**
    
    - On match (or acceptance state transition), calls:
        
        - OPTIONAL:**Google Maps API** to resolve/store **Locations** used in suggestions
            
        - **Google Calendar API** to create/update calendar event when both accepted
            
    - Stores suggestion state in **Suggested_Dates**
        
5. **Messaging Service**
    
    - Creates **Conversations** per match
        
    - Stores messages in **Messages**
        
    - Updates last_message_preview
        
6. **Moderation Service**
    
    - **Reports**: insert unique report; trigger increments reported user’s report_count
        
    - **Blocks**: insert unique block; blocks affect candidate retrieval and messaging access
        
    - **Banning**: set Users.account_status='banned' (based on policy threshold, implemented as a backend rule)
        

#### Database Layer-> essentially the server

- Tables:
    
    - `Users`, `Preferences`, `Interactions`, `Matches`, `Conversations`, `Messages`, `Reports`, `Blocks`, `Suggested_Dates`, `Locations`
        

#### External Systems

- Google Calendar API (event creation/update for accepted date)
    
- OPTIONAL: Google Maps API (place lookup/details to populate Locations)


<img width="1336" height="826" alt="model png" src="https://github.com/user-attachments/assets/3b492684-5abe-4350-9e6c-5f90f84890a9" />


## $\color{purple}{\text{TECH STACK:}}$

**FRONTEND**:

-	1-React Native + TypeScript
-	2-OR **HTML, CSS, and JavaScript** ,that we already know about lowkey ,to build the frontend of a mobile app through a "Progressive Web App" or "Hybrid"
-	 --->web app that users "install" directly from their mobile browser without going through an app store.
-	 --->or then "wrap" it in a native container so it can be installed from the **App Store** or **Google Play Store**(using **Ionic** for example)
- **CHATTING SYSTEM**:  WebSocket (Socket.IO on Node)
- **BACKEND:**  Node.js with TypeScript — NestJS
- **Primary database:**  Relational DB: MySQL
