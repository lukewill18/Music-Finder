# Music Finder

#### A web application designed to help users find new music. Main features are displaying statistics about the user’s playlist and displaying recommended artists who the user can choose to add to a playlist that the app generates.

### How To Use
The website is currently running at https://lukewill18.github.io/Music-Finder/. Otherwise, the application can only be used while running on a server, so to run locally either use Node or Live server preview plugin in Visual Studio.

### Features
#### Home Page:
- Prompts the user to login to Spotify
#### Playlist Selection Page:
- Prompts the user to choose the playlist that they would like recommendations based off of
- Also provides the option of using the user's most-listened-to artists on Spotify instead
#### Statistics Page: 
- Displays the most prevalent genres and most prevalent artists in the user’s playlist
##### Steps for doing this:
1. Calls the Spotify API to gather an array of all of the tracks in the playlist
2. Counts the number of occurrences of each artist in the playlist using the tracks array
3. Finds the artists in the playlist that do not have a Spotify ID
4. Calls the Last.fm API to find the genres of those without a Spotify ID, and calls the Spotify API to find the genres of those with one, storing the number of occurrences of each genre
5. Inserts the name of the top 10 genres and artists into the page, calculating the percentage of the playlist that each genre and artist takes up
#### Recommendations Page:
- Provides a list of recommended artists for the user to listen to
- The user can click on an artist’s name to see a picture of them, the artists in their own playlist that they are similar to, see the artist’s genres, and play a 30 second preview of one of their songs
- The user can check a box next to an artist’s name so that when they press the button labeled “Generate Playlist” one of that artist’s songs will appear in their new playlist
- Hovering over an artist’s name will display their album art on the right side of the screen
##### Steps for generating the artist recommendations:
1. Tries to call the Last.fm API for each artist in the list, querying for similar artists to them; if the API produces an error the application queries the Spotify API instead
2. The application keeps track of the similarity of the recommended artist to the user’s playlist
3. The application inserts the recommended artists into a list that the user can interact with
##### Steps for generating the playlist:
1. Iterates through the artists of each checked box, and finds their top track on Spotify if one exists
2. Adds this song to an array of Spotify IDs
3. Creates an empty playlist named Music Finder Recommendations x
4. Adds all of the top tracks to the playlist
