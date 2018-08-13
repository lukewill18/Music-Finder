const lastfm = "69ea9630699c55e46ca0816adf440f44";
let totalTracks;
const url_re = new RegExp("^.*#access_token=(.*?)&token_type=.*$");
let storage_full = false;

function swap(arr, ind1, ind2) {
    let temp = arr[ind2];
    arr[ind2] = arr[ind1];
    arr[ind1] = temp;
}

function shuffle_array(arr) {
    for(let i = 0; i < arr.length; ++i) {
        let rand = parseInt(Math.random() * 10000 % arr.length);
        swap(arr, i, rand);
    }
}

function switchPage(toHide, toShow, new_page_name) {
    toHide.addClass("hidden");
    toHide.removeClass("shown");
    toShow.removeClass("hidden");
    toShow.addClass("shown");
    window.location.hash = new_page_name;
}

function collectAllPlaylists(token) {
    return new Promise(function(resolve, reject) {
        $.ajax({
            url: "https://api.spotify.com/v1/me/playlists",
            headers: {
                'Authorization': 'Bearer ' + token
            },
            success: function(response) {
                resolve(response.items);
            }
        });
    });
}

function findPlaylistWithName(playlists, name) {
    for(let i = 0; i < playlists.length; ++i) {
        if(playlists[i].name == name) {
            totalTracks = playlists[i].tracks.total;
            return playlists[i];
        }
    }
    return null;
}

function makeTrackRequest(user, playlist, offset, token, tracks) {
    return new Promise(function(resolve, reject) {
        $.ajax({
            url: "https://api.spotify.com/v1/users/" + user + "/playlists/" + playlist + "/tracks?offset=" + offset.toString(),
            headers: {
                'Authorization': 'Bearer ' + token
            },
            success: function(response) {
                let relevant = response.items.map(function(i) {
                    return {"name": i.track.name, "artist": i.track.artists[0].name, "artist_id": i.track.artists[0].id, "images": i.track.album.images};
                });
                tracks = tracks.concat(relevant);
                resolve(tracks);
            }
        });
    });
}

function collectAllTracks(user, playlist, token, tracks) { 
    let offset = 0;
    let promises = [];
    do {
        promises.push(makeTrackRequest(user, playlist, offset, token, tracks));
        offset += 100;
    }
    while(offset < totalTracks);
    return Promise.all(promises);
}

function getArtistPrevalence(tracks) {
    let prevalence = {};
    let artist;

    for(let i = 0; i < tracks.length; ++i) {
        artist = tracks[i].artist;
        let artist_lower = artist.toLowerCase();
        if(prevalence[artist_lower] == undefined)
            prevalence[artist_lower] = {count: 1, artist_id: tracks[i].artist_id, display_name: artist};
        else
            prevalence[artist_lower].count++;
    } 
    return prevalence; 
}

function getArtistImage(artist) {
    return new Promise(function(resolve, reject) {
        $.ajax({
            url: "http://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=" + artist + "&api_key=" + lastfm + "&format=json",
            success: function(response) {

                if(response.hasOwnProperty("error")) {
                    resolve("https://image.freepik.com/free-icon/question-mark_318-52837.jpg");
                    return;
                } 
                let img = response.artist.image.length > 4 ? response.artist.image[4]["#text"] : "https://image.freepik.com/free-icon/question-mark_318-52837.jpg";
                resolve(img);
            }
        });
    });
}

function getLastfmGenres(artist, genrePrevalence) { // used if artist is not in spotify library
    let genre_name;
    return new Promise(function(resolve, reject) {
        $.ajax({
            url: "http://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&artist=" + artist + "&api_key=" + lastfm + "&format=json",
            success: function(response) {
                if(response.hasOwnProperty("error")) {
                    resolve();
                    return;
                } 
                let taglist = response.toptags.tag;
                for(let i = 0; i < taglist.length && i <= 5; ++i) {
                    genre_name = taglist[i].name.toLowerCase();
                    if(genrePrevalence[genre_name] == undefined)
                    genrePrevalence[genre_name] = 1;
                    else
                    genrePrevalence[genre_name]++;
                }
                resolve();
            }
        });
    });
}

function getSpotifyGenres(artists_with_id, artistPrevalence, promises, genrePrevalence, token) {
    let artist_ids = artists_with_id.map(function(i) {
        return artistPrevalence[i].artist_id;
    }).join(",");
    let genres;
    let genre_name;
    return new Promise(function(resolve, reject) {
        $.ajax({
            url: "https://api.spotify.com/v1/artists?ids=" + artist_ids,
            headers: {
                'Authorization': 'Bearer ' + token
            },
            success: function(response) {
                for(let i = 0; i < response.artists.length; ++i) {
                    if(response.artists[i].genres.length == 0) {
                        promises.push(getLastfmGenres(response.artists[i].name, genrePrevalence));
                    }
                    else {
                        genres = response.artists[i].genres;
                        for(let i = 0; i < genres.length && i <= 5; ++i) {
                            genre_name = genres[i].toLowerCase();
                            if(genrePrevalence[genre_name] == undefined)
                                genrePrevalence[genre_name] = 1;
                            else
                                genrePrevalence[genre_name]++;
                        }
                    }
                }
                resolve();
            }
        });
    });
}

function getGenrePrevalence(artistPrevalence, token, genrePrevalence) {
    let promises = [];
    let artists_with_id = Object.keys(artistPrevalence).filter(function(i) {
        return artistPrevalence[i].artist_id != null;
    });
    let no_ids = Object.keys(artistPrevalence).filter(function(i) {
        return artistPrevalence[i].artist_id == null;
    });
    
    for(let i = 0; i < no_ids.length; ++i) {
        promises.push(getLastfmGenres(no_ids[i], genrePrevalence));
    }

    for(let i = 0; i < artists_with_id.length; i += 50) { 
        promises.push(getSpotifyGenres(artists_with_id.slice(i, i + 50), artistPrevalence, promises, genrePrevalence, token));
    }
    return Promise.all(promises);
}

function getMostPopularTopTracks(tracks, mostPopular) {
    let i = 0;
    let nextPopularity;
    let topPopularity = tracks[0].popularity;
    do {
        mostPopular.push(tracks[i]);
        nextPopularity = (i < tracks.length - 1) ? tracks[i + 1].popularity : -1000;
        ++i;
    }
    while(topPopularity - nextPopularity <= 3);
}

function findBestTrack(mostPopular) {
    if(mostPopular.length == 1) {
        return mostPopular[0];
    }
    else {
        let sameDate = true;
        for(let i = 0; i < mostPopular.length - 1; ++i) {
            sameDate = sameDate && (mostPopular[i].album.release_date == mostPopular[i + 1].album.release_date);
        }
        if(sameDate) {
            return mostPopular[0];
        }
        else {
            mostPopular.sort(function(a, b) {
                return (new Date(a.album.release_date) > new Date(b.album.release_date));
            });
            return mostPopular[0];
        }
    }
}

function filterDuplicateAlbums(albums) {
    let add;
    let no_duplicates = [];
    for(let i = albums.length - 1; i >= 0; --i) {
        add = true;
        let name1 = albums[i].name.toLowerCase();
        for(let j = 0; j < no_duplicates.length; ++j) {
            let name2 = no_duplicates[j].name.toLowerCase();
            if(name1.includes(name2) || name2.includes(name1)) {
                add = false;
            }
        }
        if(add) no_duplicates.push(albums[i]);
    }
    return no_duplicates;
}

function setAlbumArt(spotify_id, token, recs, artist) {
    return new Promise(function(resolve, reject) {
        $.ajax({
            url: "https://api.spotify.com/v1/artists/" + spotify_id + "/albums?include_groups=album&limit=50",
            headers: {
                'Authorization': 'Bearer ' + token,
            },
            success: function(response) {
                let no_duplicates = filterDuplicateAlbums(response.items);
                for(let i = 0; i < no_duplicates.length; ++i) {
                    if(no_duplicates[i].images.length > 0) {
                        let img = no_duplicates[i].images[0].url;
                        recs[artist].album_art.push(img);
                    }
                }
                resolve();
            },
            error: function(response) {
                reject(response);
            }
        });
    });
}

function setTopTrack(spotify_id, token, recs, artist) {
    return new Promise(function(resolve, reject) {
        $.ajax({
            url: "https://api.spotify.com/v1/artists/" + spotify_id + "/top-tracks?country=US",
            headers: {
                'Authorization': 'Bearer ' + token,
            },
            success: function(response) {
                if(response.tracks[0] == undefined) {
                    resolve(spotify_id);
                    return;
                }
                let mostPopular = [];
                getMostPopularTopTracks(response.tracks, mostPopular);
                recs[artist].top_track = findBestTrack(mostPopular);
                resolve(spotify_id);
            },
            error: function(response) {
                reject(response);
            }
        });
    });
}

function setIDAndGenres(searchname, token, recs, artist) {
    return new Promise(function(resolve, reject) {
        $.ajax({
            url: "https://api.spotify.com/v1/search?q=" + searchname + "&type=artist&limit=20",
            headers: {
                'Authorization': 'Bearer ' + token,
            },
            success: function(response) {
               //  console.log(response);
                if(response.artists.total == 0) {
                    resolve();
                    return;
                }

                let match = response.artists.items[0];
                if(match.name != artist && match.name != searchname) {
                    let try_again = response.artists.items.find(function(a) {
                        return a.name == artist;
                    });
                    if(try_again != undefined) 
                        match = try_again;
                }
                for(let i = 0; i < response.artists.items.length; ++i) {
                    if(response.artists.items[i].name == artist) {
                         match = response.artists.items[i];
                         break;
                    }
                }
                recs[artist].spotify_id = match.id;
                recs[artist].genres = match.genres;
                resolve(recs[artist].spotify_id);
            },
            error: function(response) {
                reject(response);
            }
        }); 
    });
}

function getAdditionalArtistInfo(artist, token, recs) { 
    let searchname = artist.split(" ")[0].toLowerCase() == "the" ?  artist.slice(4) : artist;
    return new Promise(function(resolve, reject) {
        let p1 = setIDAndGenres(searchname, token, recs, artist);
        p1.catch(function(msg) {
            reject(msg);
        });
        p1.then(function(spotify_id) {
            if(spotify_id == undefined) {
                resolve();
            }
            else {
                let p2 = setTopTrack(spotify_id, token, recs, artist);
                p2.catch(function(msg) {
                    reject(msg);
                });
                p2.then(function(spotify_id) {
                    if(spotify_id == undefined) {
                        resolve();
                    }
                    else {
                        let p3 = setAlbumArt(spotify_id, token, recs, artist);
                        p3.catch(function(msg) {
                            reject(msg);
                        });
                        p3.then(function() {
                            resolve();
                        });
                    }
                });
            }
        });
    });
}

function getSpotifyRecs(artist, artistPrevalence, token, recname, recs) {
    return new Promise(function(resolve, reject) {
        if(artistPrevalence[artist].artist_id == null) {
            resolve();
            return;
        }
        $.ajax({
            url: "https://api.spotify.com/v1/artists/" + artistPrevalence[artist].artist_id + "/related-artists",
            headers: {
                'Authorization': 'Bearer ' + token
            },
            success: function(response) {
               // console.log("spotify", response);
                for(let i = 0; i < response.artists.length; ++i) {
                    recname = response.artists[i].name;
                    if(recs.hasOwnProperty(recname)) {
                        recs[recname].match += artistPrevalence[artist].count * .5;
                        recs[recname].similarTo.push({name: artistPrevalence[artist].display_name, similarity: .7});
                    }
                    else {
                        if(artistPrevalence.hasOwnProperty(recname.toLowerCase())) continue;
                        let images = response.artists[i].images;
                        let pic = images.length > 0 ? images[0].url : "http://www.emoji.co.uk/files/microsoft-emojis/symbols-windows10/10176-white-question-mark-ornament.png";
                        recs[recname] = {match: artistPrevalence[artist].count * .5, similarTo: [ {name: artistPrevalence[artist].display_name, similarity: .7}], info_id: null,
                        art_id: null, image: pic, spotify_id: null, genres: [], top_track: null, album_art: []};                    
                    }
                }
                resolve();
            }
        });
    });
}

function updateRecsLastfm(artist, artistPrevalence, lastfmrecs, recs) {
    for(let i = 0; i < lastfmrecs.length; ++i) {
        recname = lastfmrecs[i].name;
        if(artistPrevalence.hasOwnProperty(recname.toLowerCase())) continue; // user already listens to this artist
        if(recs.hasOwnProperty(recname)) {
            recs[recname].match += (artistPrevalence[artist].count * lastfmrecs[i].match); //weight with number of occurences of parent artist * similarity of child
            recs[recname].similarTo.push({name: artistPrevalence[artist].display_name, similarity: lastfmrecs[i].match});
        }
        else {
            let images = lastfmrecs[i].image;
            let pic = images.length > 4 ? images[4]["#text"] : "http://www.emoji.co.uk/files/microsoft-emojis/symbols-windows10/10176-white-question-mark-ornament.png";
            recs[recname] = { match: artistPrevalence[artist].count * lastfmrecs[i].match, 
                similarTo: [{name: artistPrevalence[artist].display_name, similarity: lastfmrecs[i].match}], info_id: null,
                art_id: null, image: pic, spotify_id: null, genres: [], top_track: null, album_art: []};
        }                       
    }
}

function getLastfmRecs(artist, artistPrevalence, token, recname, recs, promises) {
    return new Promise(function(resolve, reject) {
        let cached = sessionStorage.getItem(artist);
        if(cached != null) {
            let response = JSON.parse(cached);
            updateRecsLastfm(artist, artistPrevalence, response.recommendations, recs);
            resolve();
        }
        else {
            $.ajax({
                url: "http://ws.audioscrobbler.com/2.0/?method=artist.getsimilar&artist=" + artist + "&api_key=" + lastfm + "&format=json",
                success: function(response) {    
                 //   console.log(response);
                    if(response.hasOwnProperty("error")) {
                        promises.push(getSpotifyRecs(artist, artistPrevalence, token, recname, recs));
                        resolve();
                    }
                    else {
                        let lastfmrecs = response.similarartists.artist;
                        if(!storage_full) {
                            let relevant_info = {recommendations: []};
                            for(let i = 0; i < lastfmrecs.length; ++i) {
                                relevant_info.recommendations.push({name: lastfmrecs[i].name, match: lastfmrecs[i].match, image: lastfmrecs[i].image});
                            }
                            try {
                                sessionStorage.setItem(artist, JSON.stringify(relevant_info));
                            }
                            catch(e) {
                                storage_full = true;
                            }
                        }
                        updateRecsLastfm(artist, artistPrevalence, lastfmrecs, recs);
                        resolve();
                    }
                }
            });
        }
    });
}


function collectArtistRecs(artistPrevalence, token, recs) {
    let recname;
    let promises = [];
    //console.time("recs");
    for(let artist in artistPrevalence) {
        promises.push(getLastfmRecs(artist, artistPrevalence, token, recname, recs, promises));
    }
    return Promise.all(promises);
}

function determineSimilarity(sim) {
    if(sim >= .7)
        return "very-close-match";
    else if(sim >= .5)
        return "close-match";
    else if(sim >= .3)
        return "slight-match";
    else   
        return "very-slight-match";      
}

function createEmptyPlaylist(user, token, playlistName) {
    let json_string = JSON.stringify({
        "name": playlistName,
        "description": "Tracks from artists recommended by Music Finder"
    });
    return new Promise(function(resolve, reject) {
        $.ajax({
            url: "https://api.spotify.com/v1/users/" + user + "/playlists",
            method: "POST",
            headers: {
                'Authorization': 'Bearer ' + token,
            },
            data: json_string,
            contentType: "application/json",
            success: function(response) {
                let playlist = response;
                resolve(playlist);
            }
        });
    });
}

function addTracksToPlaylist(trackids, playlist, user, token) {
    let promises = [];
    for(let i = 0; i < trackids.length; i += 100) {
        let track_slice = trackids.slice(i, i + 100);
        let json_string = JSON.stringify({
            "uris": track_slice
        });
        promises.push(new Promise(function(resolve, reject) {
            $.ajax({
                url: "https://api.spotify.com/v1/users/" + user + "/playlists/" + playlist + "/tracks",
                method: "POST",
                headers: {
                    'Authorization': 'Bearer ' + token,
                },
                contentType: "application/json",
                data: json_string,
                success: function(response) {
                    resolve();
                }
            });
        }));
    }
    return Promise.all(promises);
}

function generatePlaylist(artistsToAdd, user, token, playlistName, artistRecs) {
    let tracksToAdd = artistsToAdd.map(function(i) {
        return artistRecs[i].top_track;
    });
    let promises = [];
    let playlist;
    let url;

    promises.push(createEmptyPlaylist(user, token, playlistName));
    return new Promise(function(resolve, reject) {
        Promise.all(promises).then(function(resolves) {
            playlist = resolves[0];
            let trackIds = tracksToAdd.filter(function(track){
                return track != null;
            }).map(function(track) {
                return track.uri;
            });
            return addTracksToPlaylist(trackIds, playlist.id, user, token)
        }).then(function() {
            url = playlist.external_urls.spotify;
            resolve(url);
        });
    });
}

/*
async function collectAllLyrics(tracks) {
    let track_ids = [];
    let lyrics = [];
    for(let i = 0; i < tracks.length; ++i) {
        try {
        await $.ajax({
            url: "http://api.musixmatch.com/ws/1.1/track.search?apikey=3a403fbc976e987946c33e9914f88c1a&q_track=" + tracks[i].name + "&q_artist=" + tracks[i].artist + "&page_size=1&page=1",
            dataType: "json",
            headers: {'Access-Control-Allow-Origin': '*'},
            method: "GET",
    
            success: function(response) {
                if(response.message.body.track_list.length == 0) return;
                if(response.message.body.track_list[0].track.has_lyrics != 0)
                    track_ids.push(response.message.body.track_list[0].track.track_id);
            }
        });
    }
        catch(SyntaxError) {
            continue;
        }
    }
    for(let i = 0; i < track_ids.length; ++i) {
        await $.ajax({
            url: "http://api.musixmatch.com/ws/1.1/track.lyrics.get?apikey=3a403fbc976e987946c33e9914f88c1a&track_id=" + track_ids[i].toString(),
            dataType: "json",
            method: "GET",
    
            success: function(response) {
                lyrics.push(response.message.body.lyrics.lyrics_body.slice(0, -75));
            }
        });
    }
    return lyrics;
}*/

$(document).ready(function() {
    const body = $("body");
    const backgroundVideo = $("#background-video");
    const playlistPage = $("#playlist-entry-page");
    const nextPlaylist = playlistPage.find("#next-playlist");
    const prevPlaylist = playlistPage.find("#prev-playlist");
    const playlistImageBox = playlistPage.find("#playlist-select-box");
    const noResultsVisual = playlistImageBox.find(".no-results");
    const input = playlistPage.find("#playlist-entry");
    const alert = $("#alert");
    const statsPage = $("#stats-page");
    const statsBackground = statsPage.find("#stats-background");
    const recPage = $("#recommendation-page");
    const recsBackground = recPage.find("#recs-background");
    const finishPage = $("#finish-page");
    const topArtists = statsPage.find("#top-artists");
    const topGenres = statsPage.find("#top-genres");
    const artistRecList = recPage.find("#artist-recs");
    const modalContainer = recPage.find("#modal-container");
    const artBox = recPage.find("#album-art-frame");
    const recModal = modalContainer.find("#rec-modal");
    const closeModalBtn = recModal.find("#rec-modal-close");
    let playlists_loaded = false;
    let showing_modal = false;
    let recOffset = 0;
    let recs_background_loaded = false;
    let playlists;
    let playlist;
    let visuals;
    let current_visual = 0;
    let moving_visual = false;
    let user;
    let token;
    let artistPrevalence;
    let genrePrevalence = {};
    let artistOrder;
    let genreOrder;
    let stats_loaded = false;
    let recs_loaded = false;
    let recs_loading = false;
    let tracks = [];
    let artistRecs = {};
    let artistsToAdd = [];
    let current_rec_info;
    let current_art;
    let shuffle;
    let showing_alert = false;

    function showAlert(alert, message) {
        showing_alert = true;
        anime({
            targets: '#alert',
            opacity: {
                value: 1,
                duration: 700
            },
            top: {
                value: "5px",
                duration: 300
            },
            easing: "linear",
        });
    
        //alert.css({"opacity": 1, "z-index": 1, "top": "5px"});
        alert.text("Error: " + message);
        setTimeout(function() {
            anime({
                targets: '#alert',
                opacity: {
                    value: 0,
                    duration: 100
                },
                top: {
                    value: "-500px",
                    duration: 300
                },
                easing: "linear",
            });
            showing_alert = false;
        }, 4500);
    }

    function filter_visuals(valid_playlists, search_phrase) {
        let toShow = [];
        for(let i = 0; i < valid_playlists.length; ++i) {
            toShow.push(playlistImageBox.find(valid_playlists[i])[0]);
        }
        $(visuals[current_visual]).removeClass("playlist-visual-active");
        $(visuals[current_visual]).addClass("hidden");
        visuals = toShow;
        if(toShow.length > 0) {
            noResultsVisual.addClass("hidden");
            noResultsVisual.removeClass("playlist-visual-active");
            $(toShow[0]).addClass("playlist-visual-active");
            $(toShow[0]).removeClass("hidden");
            $(toShow[0]).css("left", 0);
            current_visual = 0;
        }
        else {
            current_visual = -1;
            noResultsVisual.removeClass("hidden");
            noResultsVisual.addClass("playlist-visual-active");
            noResultsVisual.children("#invalid-playlist-name").text(search_phrase);
        }
    }
    
    function addPlaylistVisuals() {
        let temp = ``;
        for(let i = 0; i < playlists.length; ++i) {
            temp += `<div class="playlist-visual" id="visual${i}">
                        <img class="playlist-img" src="${playlists[i].images[0].url}">
                        <p class="playlist-name">${playlists[i].name}</p>
                    </div>`;
        }
        playlistImageBox.find(".loader").remove();
        playlistImageBox.append(temp);
    }

    nextPlaylist.click(function() {
        moveVisual(1);
    });
    prevPlaylist.click(function() {
        moveVisual(-1);
    });

    function moveVisual(direction) {
        if(visuals == undefined || moving_visual || visuals.length < 2) return;
        moving_visual = true;

        let next_visual = (current_visual + direction) % visuals.length;
        if(next_visual < 0)
            next_visual = visuals.length - 1;

        let box_width = playlistImageBox.css("width");
        if(direction == -1)
            $(visuals[next_visual]).css("left", "-" + box_width);
        else
            $(visuals[next_visual]).css("left", box_width)

        let new_left = direction == 1 ? "-=" + box_width : "+=" + box_width;

        $(visuals[next_visual]).removeClass("hidden");
        anime({
            targets: [visuals[current_visual], visuals[next_visual]],
            left: {
                value: new_left,
                duration: 400,
                easing: "linear"    
            },
            complete: function(e) {
                moving_visual = false;
                current_visual = next_visual;
                $(e.animatables[0].target).removeClass("playlist-visual-active");
                $(e.animatables[0].target).addClass("hidden");
                $(e.animatables[1].target).addClass("playlist-visual-active");
            }
        });
    }

    function handlePlaylistSelection() {
        addPlaylistVisuals();
        visuals = playlistImageBox.find(".playlist-visual");
        $(visuals[current_visual]).addClass("playlist-visual-active");
        playlists_loaded = true;
    }

    function choose_playlist(active_visuals) {
        let id = active_visuals[0].id;
        let new_playlist = playlists[parseInt(id.slice(id.length - 1))];
        if(playlist == undefined || playlist.id != new_playlist.id) {
            stats_loaded = false;
            recs_loaded = false;
        }
        playlist = new_playlist;
        user = playlist.owner.id;
        totalTracks = playlist.tracks.total;
        handleStatistics(user, playlist.id);
    }

    playlistImageBox.click(function() {
        if(moving_visual) return;
        let active = $(this).find(".playlist-visual-active");
        if(active.length == 0) return;
        choose_playlist(active);
    });

    playlistImageBox.mouseenter(function() {
        if(current_visual > -1) {
            $(this).addClass("glow");
        }
    });
    playlistImageBox.mouseleave(function() {
        if(current_visual > -1) {
            $(this).removeClass("glow");
        }
    });

    let url_check = window.location.href.match(url_re);
    if(url_check != null) {
        window.location.hash = "#playlist-select";
        //switchPage($("#prelogin-page"), playlistPage, "#playlist-select");
        /*token = url_check[1];
        input.focus();
        let playlistPromise = collectAllPlaylists(token, playlists);
        playlistPromise.then(function(result) {
            playlists = result.filter(function(p) {
                return !p.name.includes("<script") && !p.name.includes("/script>");
            });
            handlePlaylistSelection();
        });*/
    }
    else {
        window.location.hash = "";
    }

    $("#login-btn").click(function() {
        window.location.href = "https://accounts.spotify.com/authorize?client_id=73df06c4d237418197bc43d50f729c0f&response_type=token&scope=playlist-modify-public&redirect_uri=http://localhost:5500/&show_dialog=true";
    });

    function clearStats() {
        topArtists.find(".top-artist-col").remove();
        topGenres.find(".text-background").remove();
        statsBackground.find(".stats-background-box").remove();
        topArtists.find(".loading").removeClass("hidden");
        topGenres.find(".loading").removeClass("hidden");
        tracks = [];
        artistPrevalence = {};
        genrePrevalence = {};
    }

    function insertTopArtists(tracks) {
        
        let template = ``;

        artistOrder = Object.keys(artistPrevalence).sort(function(a, b) {
            return artistPrevalence[b].count - artistPrevalence[a].count;
        });

        let image_promises = [];
        for(let i = 0; i < artistOrder.length && i < 10; ++i) {
            image_promises.push(getArtistImage(artistOrder[i]));
        }
        Promise.all(image_promises).then(function(images) {
            for(let i = 0; i < artistOrder.length && i < 10; ++i) {
                template += `
                            <div class="top-artist-col">
                                <div class="text-background">
                                    <li class="top-artist">
                                        <div class="top-artist-img-container">
                                            <img class="top-artist-img" src="${images[i]}">
                                        </div>
                                        <p class="top-artist-info">
                                            ${artistPrevalence[artistOrder[i]].display_name} <br>(${(artistPrevalence[artistOrder[i]].count/tracks.length * 100).toFixed(2)}%)
                                        </p>
                                    </li>
                                </div>
                            </div>`;
                            
            }
            topArtists.find(".loading").addClass("hidden");
            topArtists.find(".row").append(template);
        });
    }

    function insertTopGenres(tracks) {
        let template = ``;
        genreOrder = Object.keys(genrePrevalence).sort(function(a, b) {
            return genrePrevalence[b] - genrePrevalence[a];
        });
        for(let i = 0; i < genreOrder.length && i < 10; ++i) {
            template += `<div class="text-background"><li class="top-genre">${genreOrder[i]} (${(genrePrevalence[genreOrder[i]]/tracks.length * 100).toFixed(2)}%)</li></div>`;
        }
        topGenres.find(".loading").addClass("hidden");
        topGenres.append(template);
        stats_loaded = true;
    }

    function setStatsPageBackground() {
        let img_index;

        if(tracks.length >= 100) {
            img_index = 1;
        }
        else {
            img_index = 0;
        }
        let all_images = tracks.filter(function(t) {
            return t.images[img_index] != undefined && Math.abs(t.images[img_index].height - t.images[img_index].width) < 100;
        }).map(function(t) {
            return t.images[img_index].url;
        });
        shuffle_array(all_images);
        let images = new Set(all_images);
        let i = 0;
        let temp = ``;
        let max = all_images.length >= 300 ? 300 : 200;
        let fb = all_images.length >= 300 ? "8%" : "10%";
        while(i < max) {
            for(let image of images) {           
                if(i >= max) break;
                temp += `<div class="stats-background-box" style="flex-basis: ${fb}">
                            <img class="stats-background-img" src=${image}>
                        </div>`
                ++i;
            }
        }
        statsBackground.append(temp);
    }

    function handleStatistics(user, playlist) {
        window.location.hash = "#statistics";
        /*
        switchPage(playlistPage, statsPage, "#statistics");
        backgroundVideo.addClass("hidden");
        let trackPromise = collectAllTracks(user, playlist, token, tracks);
        trackPromise.then(function(track_blocks) {
            for(let i = 0; i < track_blocks.length; ++i) {
                tracks = tracks.concat(track_blocks[i]);
            }
            setStatsPageBackground();
            artistPrevalence = getArtistPrevalence(tracks);
            //console.log(artistPrevalence);
            insertTopArtists(tracks);
            let genrePromise = getGenrePrevalence(artistPrevalence, token, genrePrevalence);
            genrePromise.then(function() {
                insertTopGenres(tracks);
            }); 
        });*/
    }

    function clearRecs() {
        if(showing_modal) hideModal();
        artistRecList.find(".artist-rec:not(#check-all-row)").remove();
        recModal.find(".rec-info-box").remove();
        recsBackground.find(".recs-background-box").remove();
        artistRecList.find("#check-all-row").addClass("hidden");
        artistRecList.find(".loading").removeClass("hidden");
        artistRecList.find(".new-loader").remove();
        artBox.find("*").remove();
        recOffset = 0;
        artistRecs = {};
        recs_background_loaded = false;
    }

    function setRecsBackground(recOrder, num_recs) {
        let images = [];
        let total_length = 0;
        for(let i = 0; i < num_recs; ++i) {
            total_length += artistRecs[recOrder[i]].album_art.length;
        }
        let j = 0;
        while(images.length < 200 && images.length < total_length) {
            for(let i = 0; i < num_recs; ++i) {
                let art = artistRecs[recOrder[i]].album_art[j];
                if(art != undefined)
                    images.push(art);
                if(images.length >= 200) break;
            }
            ++j;
        }
        shuffle_array(images);
        let temp = ``;
        for(let i = 0; i < images.length; ++i) {
            temp += `<div class="recs-background-box"><img src="${images[i]}" class="recs-background-img"></div>`;
        }
        recsBackground.append(temp);
        recs_background_loaded = true;
    }

    function generateArtistModalTemplate(artistRecs, recOrder, i, sortedSimilar) {  
        let template = `<div class="rec-info-box hidden" id="info${i}">
                            <h2>${recOrder[i]}</h2>
                            <div class="row">
                                <div class="col-5 col-sm-3 artist-img-col">
                                    <img class="artist-img" src="${artistRecs[recOrder[i]].image}">
                                </div>
                                <div class="col-7 col-sm-9 left-align">
                                    <div class="rec-genre-list-container">`;
                                    if(artistRecs[recOrder[i]].genres.length > 0) {
                                        template += `<p class="rec-genre-list">Genres: ${artistRecs[recOrder[i]].genres.join(", ")}</p>`;
                                    }
                                    else {
                                        template += `(No genres available)`
                                    }
                                    template += `
                                    </div>
                                    <div class="song-preview-container">`;
                        if(artistRecs[recOrder[i]].top_track != null) {
                            template += `<audio controls class="preview-clip" preload="none" src="${artistRecs[recOrder[i]].top_track.preview_url}">`
                        }
                        else {
                            template += `(No song preview available)`
                        }
                        template += `
                                    </div>
                                </div>
                            </div>
                            <div class="similar-to-box"><p class="similar-to">Similar to: `;
        for(let j = 0; j < sortedSimilar.length; ++j) {
            let sim = sortedSimilar[j].similarity;
            let simClass = determineSimilarity(sim);      
            template += `<span class="${simClass}">${sortedSimilar[j].name}</span>, `
        }
        template = template.slice(0, -2);
        template += `</p></div></div>`;
        return template;
    }

    function generateSideArtTemplate(artistRecs, recOrder, i) {
        let template = `<div id="art${i}" class="hidden">`;
        artistRecs[recOrder[i]].art_id = "art" + i.toString();
        let art = artistRecs[recOrder[i]].album_art;
        for(let j = 0; j < art.length; ++j) {
            template += `<img class="album-art" src="${art[j]}" draggable="false">`
        }
        template += `</div>`
        return template;
    }

    function insertArtistRecs(artistRecs, token, num_recs) {
        let promises = [];
       
        let li_template = ``;
        let modal_template  = ``;
        let side_art_template = ``;
        let recOrder = Object.keys(artistRecs).sort(function(a, b) {
            return artistRecs[b].match - artistRecs[a].match;
        });
        
        for(let i = recOffset; i < recOrder.length && i < num_recs + recOffset; ++i) {
            promises.push(getAdditionalArtistInfo(recOrder[i], token, artistRecs));
        }
        return new Promise(function(resolve, reject) {
            let all = Promise.all(promises);
            all.catch(function(msg) {
                reject(msg);
            });
            all.then(function() {
                if(!recs_background_loaded) 
                    setRecsBackground(recOrder, num_recs);
                let check_all = recPage.find("#check-all");
                let pre_checked;
                if(check_all.length < 1)
                    pre_checked = false;
                else   
                    pre_checked = check_all[0].checked;
                
                    for(let i = recOffset; i < recOrder.length && i < num_recs + recOffset; ++i) {
                    let sortedSimilar = artistRecs[recOrder[i]].similarTo.sort(function(a, b) {
                        return b.similarity - a.similarity;
                    });
                    artistRecs[recOrder[i]].info_id = "info" + i.toString();
                    
                    li_template += `<li class="artist-rec centered"><input type="checkbox" class="rec-checkbox"`
                    if(pre_checked) {
                        li_template += ` checked`
                    }
                    li_template += `><p class="rec-name">${recOrder[i]}</p></li>`;
                    modal_template += generateArtistModalTemplate(artistRecs, recOrder, i, sortedSimilar);
                    side_art_template += generateSideArtTemplate(artistRecs, recOrder, i);
                }
                artistRecList.find(".loading").addClass("hidden");
                artistRecList.find("#check-all-row").removeClass("hidden");
                artistRecList.append(li_template);
                recModal.append(modal_template);
                artBox.append(side_art_template);
                let audio_clips = recModal.find(".preview-clip");
                for(let i = 0; i < audio_clips.length; ++i) {
                    audio_clips[i].volume = .25;
                }
                recOffset += num_recs;
                resolve();
            });        
        });
    }
    
    function handleRecommendations() {
        let artistRecPromise = collectArtistRecs(artistPrevalence, token, artistRecs);
        artistRecPromise.then(function() {
            //console.log(artistRecs);
            //console.timeEnd("recs");
            //console.log(artistRecs);
            let insertPromise = insertArtistRecs(artistRecs, token, 30);
            insertPromise.catch(function(msg) {
                showAlert(alert, "Could not load recommendations, please refresh the page and try again");
            });
            insertPromise.then(function() {
                recs_loaded = true;
                artistRecList.scrollTop(0);
            });
        });
    }

    input.keyup(function(e) {
        if(e.which == 13) {
            if(current_visual != -1) {
                choose_playlist(playlistImageBox.find(".playlist-visual-active"));
            }
        }
        let str = $(this).val();
        let valid_playlists = [];
        for(let i = 0; i < playlists.length; ++i) {
            if(playlists[i].name.toLowerCase().includes(str.toLowerCase())) {
                valid_playlists.push("#visual" + i.toString());
            }
        }
        filter_visuals(valid_playlists, str);
    });
    statsPage.find("#recommendation-btn").click(function() {
        if(!stats_loaded) return;
        window.location.hash = "#recommendations";
        /*switchPage(statsPage, recPage, "#recommendations");
        handleRecommendations();*/
       });


    function hideModal() {
        modalContainer.css("display", "none");
     //   body.toggleClass("stop-scroll");
        recModal.css("opacity", "0");
        artistRecList.find(".artist-rec").removeClass("push-back");
        artistRecList.find(".shadow").removeClass("shadow");
        let current_preview = current_rec_info.find(".preview-clip")[0];
        if(current_preview != undefined) {
            current_preview.pause();
            current_preview.currentTime = 0;
        }
        current_rec_info.toggleClass("hidden");
        
    }
    
    closeModalBtn.click(hideModal);

    recPage.click(function(event) {
        if($(event.target).is(modalContainer)) {
          hideModal();
        }
    });

    let modalAnimation = anime({
        targets: '#rec-modal',
        opacity: 1,
        top: "50px",
        easing: "linear",
        duration: 350
    });

    let backgroundAnimation = anime({
        targets: '#modal-container',
        backgroundColor: "rgba(0, 0, 0, .4)",
        duration: 250
    });

    recPage.on("click", ".rec-name", function() {
        let name = $(this).text();
        if(!artistRecs.hasOwnProperty(name)) return;
        
        artistRecList.find(".artist-rec").addClass("push-back");
        $(this).parent().addClass("shadow").removeClass("push-back");
        current_rec_info = recPage.find("#" + artistRecs[name].info_id);
        current_rec_info.toggleClass("hidden");
        modalContainer.css("display", "block");
        showing_modal = true;
     //   body.toggleClass("stop-scroll");
        
        modalAnimation.restart();
        backgroundAnimation.restart();
    });

    recPage.on("click", ".artist-rec", function(e) {
        if(e.target == this) {
            let checkbox = $(this).children("input")[0];
            if(checkbox != undefined) {
                $(checkbox).prop("checked", !checkbox.checked);
                if(checkbox.id == "check-all") 
                    recPage.find(".rec-checkbox").prop("checked", checkbox.checked);
            }
        }
    });

    function shuffle_art(album_art) {
        let current = 0;
        $(album_art[current]).css("opacity", "1");
        shuffle = setInterval(function() {
            $(album_art[current]).css("opacity", "0");
            current = (current + 1) % album_art.length;
            $(album_art[current]).css("opacity", "1");
        }, 3000);
    }

    recPage.on("mouseenter", ".rec-name", function() {        
        let name = $(this).text();
        if(!artistRecs.hasOwnProperty(name)) return;

        if(current_art == undefined) {
            current_art = recPage.find("#" + artistRecs[name].art_id);
            $(current_art).toggleClass("hidden");
            shuffle_art($(current_art).find(".album-art"));
        }
        else 
        {
            let new_art = recPage.find("#" + artistRecs[name].art_id);
            if(new_art[0].id == current_art[0].id) 
                return;
            $(current_art).addClass("hidden");
            $(current_art).find(".album-art").css("opacity", "0");
            clearInterval(shuffle);
            current_art = new_art;
            $(current_art).removeClass("hidden");
            shuffle_art($(current_art).find(".album-art"));
        }
    });

    function generatePlaylistName(playlists) {
        let playlistName = "Music Finder Recommendations 1";
        let playlistNames = playlists.map(function(i) {
            return i.name;
        });
        let index = 2;
        while(playlistNames.indexOf(playlistName) > -1) {
            playlistName = playlistName.slice(0, -1);
            playlistName += index.toString(); 
            ++index;
        }
        return playlistName;
    }


    recPage.on("click", "#check-all", function() {
        recPage.find(".rec-checkbox").prop("checked", this.checked);
    });

    recPage.find("#generate-playlist-btn").click(function() {
        if(!recs_loaded) return;
        let checked = recPage.find(".rec-checkbox:checkbox:checked");
        if(checked.length == 0) {
            showAlert(alert, "No artists selected. Please check boxes of the artists that you want to add to the playlist.");
            return;
        }
        for(let i = 0; i < checked.length; ++i) {
            let name = $(checked[i]).siblings(".rec-name").text();
            if(artistRecs.hasOwnProperty(name)) {
                artistsToAdd.push(name);
            }
        }
        let playlistName = generatePlaylistName(playlists);
        let urlPromise = generatePlaylist(artistsToAdd, user, token, playlistName, artistRecs);
        urlPromise.then(function(url) {
            playlistURL = url;
            switchPage(recPage, $("#finish-page"), "#finish");
            backgroundVideo.removeClass("hidden");
        });
    });


    finishPage.find("#playlist-link-btn").click(function() {
        if(playlistURL == undefined) return;
        window.open(playlistURL);
    });


    artistRecList.scroll(function(e) {
        if(recs_loading || showing_alert) return;
        if(recs_loaded) {
            let scroll_dist = $(this).scrollTop() + $(this).innerHeight();
            if(scroll_dist + 100 > this.scrollHeight) {
                recs_loading = true;
                artistRecList.append(`<li class="new-loader"><div class="loader"></li>`);
                let insertPromise = insertArtistRecs(artistRecs, token, 20);
                insertPromise.catch(function(msg) {
                    showAlert(alert, "Could not load recommendations, please wait a few seconds");
                    artistRecList.find(".new-loader").remove();
                    recs_loading = false;
                });
                insertPromise.then(function() {
                    artistRecList.find(".new-loader").remove();
                    recs_loading = false;
                });
            }
        }
    });

    function switchToPlaylistPage(current) {
        switchPage(current, playlistPage, "#playlist-select");

        backgroundVideo.removeClass("hidden");
        token = url_check[1];
        input.val("");
        input.focus();
        if(!playlists_loaded) {
            let playlistPromise = collectAllPlaylists(token, playlists);
            playlistPromise.then(function(result) {
                playlists = result.filter(function(p) {
                    return !p.name.includes("<script") && !p.name.includes("/script>") && p.tracks.total > 0;
                });
                handlePlaylistSelection();
            });
        }
        else {
            let valid_playlists = [];
            for(let i = 0; i < playlists.length; ++i) {
                valid_playlists.push("#visual" + i.toString());
            }
            filter_visuals(valid_playlists, "");
        }
    }

    function switchToStatsPage(current) 
    {
        if(current_rec_info != undefined) {
            let current_preview = current_rec_info.find(".preview-clip")[0];
            if(current_preview != undefined) {
                current_preview.pause();
            }
        }        
        switchPage(current, statsPage, "#statistics");
     //   body.removeClass("stop-scroll");
        backgroundVideo.addClass("hidden");
        if(!stats_loaded) {
            clearStats();
            let trackPromise = collectAllTracks(user, playlist.id, token, tracks);
            trackPromise.then(function(track_blocks) {
                for(let i = 0; i < track_blocks.length; ++i) {
                    tracks = tracks.concat(track_blocks[i]);
                }
                setStatsPageBackground();
                artistPrevalence = getArtistPrevalence(tracks);
                //console.log(artistPrevalence);                
                insertTopArtists(tracks);
                let genrePromise = getGenrePrevalence(artistPrevalence, token, genrePrevalence);
                genrePromise.then(function() {
                    insertTopGenres(tracks);
                    if(!recs_loaded) {
                        clearRecs();
                        handleRecommendations();
                    }
                }); 
            });
            playlist_changed = false;
        }
    }

    function switchToRecsPage(current) 
    {
        switchPage(current, recPage, "#recommendations");
        /* if(!recs_loaded) {
            clearRecs();
            handleRecommendations();
        } */
    }

    $(window).on("hashchange", function() {
        let hash = window.location.hash;
        let current = body.find(".shown");
        if(hash == "#playlist-select") {
            switchToPlaylistPage(current);
        }
        else if(hash == "#statistics") {
            switchToStatsPage(current);
        }
        else if(hash == "#recommendations") {
            switchToRecsPage(current);
        }
    });
});