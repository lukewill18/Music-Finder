const lastfm = "69ea9630699c55e46ca0816adf440f44";
let totalTracks;
const url_re = new RegExp("^.*#access_token=(.*?)&token_type=.*$")

function showAlert(alert, message) {
    alert.css({"opacity": 1, "z-index": 1, "top": "5px"});
    alert.text("Error: " + message);
    setTimeout(function() {
        alert.css({"opacity": 0, "z-index": 0, "top": "-500px"});
    }, 4500);
}

function switchPage(toHide, toShow) {
    toHide.addClass("hidden");
    toShow.removeClass("hidden");
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
                    return {"name": i.track.name, "artist": i.track.artists[0].name, "artist_id": i.track.artists[0].id};
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
        artist_lower = artist.toLowerCase();
        if(prevalence[artist_lower] == undefined)
            prevalence[artist_lower] = {count: 1, artist_id: tracks[i].artist_id, display_name: artist};
        else
            prevalence[artist_lower].count++;
    } 
    return prevalence; 
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
    let artist_name;
    let genres;
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
                for(let i = 0; i < response.artists.length; ++i) {
                    recname = response.artists[i].name;
                    if(recs.hasOwnProperty(recname)) {
                        recs[recname].match += artistPrevalence[artist].count * .5;
                        recs[recname].similarTo.push({name: artistPrevalence[artist].display_name, similarity: .7});
                    }
                    else {
                        if(artistPrevalence.hasOwnProperty(recname.toLowerCase())) continue;
                        recs[recname] = {match: artistPrevalence[artist].count * .5, similarTo: [ {name: artistPrevalence[artist].display_name, similarity: .7} ] };
                    }
                }
                resolve();
            }
        });
    });
}

function getLastfmRecs(artist, artistPrevalence, token, recname, recs, promises) {
    return new Promise(function(resolve, reject) {
        let lastfmrecs;
        $.ajax({
            url: "http://ws.audioscrobbler.com/2.0/?method=artist.getsimilar&artist=" + artist + "&api_key=" + lastfm + "&format=json",
            success: async function(response) {                
                if(response.hasOwnProperty("error")) {
                    promises.push(getSpotifyRecs(artist, artistPrevalence, token, recname, recs));
                    resolve();
                }
                else {
                    lastfmrecs = response.similarartists.artist;
                    for(let i = 0; i < lastfmrecs.length; ++i) {
                        recname = lastfmrecs[i].name;
                        if(recs.hasOwnProperty(recname)) {
                            recs[recname].match += (artistPrevalence[artist].count * lastfmrecs[i].match); //weight with number of occurences of parent artist * similarity of child
                            recs[recname].similarTo.push({name: artistPrevalence[artist].display_name, similarity: lastfmrecs[i].match});
                        }
                        else {
                            if(artistPrevalence.hasOwnProperty(recname.toLowerCase())) continue; // user already listens to this artist
                            recs[recname] = { match: artistPrevalence[artist].count * lastfmrecs[i].match, similarTo: [{name: artistPrevalence[artist].display_name, similarity: lastfmrecs[i].match}] };
                        }
                    }
                    resolve();
                }
            }
        });
    });
}

function collectArtistRecs(artistPrevalence, token, recs) {
    
    let recname;
    let promises = [];

    for(let artist in artistPrevalence) {
        promises.push(getLastfmRecs(artist, artistPrevalence, token, recname, recs, promises));
    }
    return Promise.all(promises);
}

function collectGenreRecs(genrePrevalence) {
    let recs = {};
    for(let genre in genrePrevalence) {
        console.log(genre);
        $.ajax({
            url: "http://ws.audioscrobbler.com/2.0/?method=tag.getsimilar&tag=" + genre + "&api_key=" + lastfm + "&format=json",
            success: function(response) {
                console.log(response);
            }
        });
    }
}

function chooseSimClass(sim) {
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

function getArtistId(artist, token, artistIds) {
    if(artist.split(" ")[0].toLowerCase() == "the") {
        artist = artist.slice(4);
    }
    return new Promise(function(resolve, reject) {
        $.ajax({
            url: "https://api.spotify.com/v1/search?q=" + artist + "&type=artist&limit=1",
            headers: {
                'Authorization': 'Bearer ' + token,
            },
            success: function(response) {
                if(response.artists.total == 0) {
                    resolve();
                    return;
                }
                artistIds.push(response.artists.items[0].id);
                resolve();
            }
        }); 
    });
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

function findBestTrack(mostPopular, tracksToAdd) {
    if(mostPopular.length == 1) {
        tracksToAdd.push(mostPopular[0]);
    }
    else {
        let sameDate = true;
        for(let i = 0; i < mostPopular.length - 1; ++i) {
            sameDate = sameDate && (mostPopular[i].album.release_date == mostPopular[i + 1].album.release_date);
        }
        if(sameDate) {
            tracksToAdd.push(mostPopular[0]);
        }
        else {
            mostPopular.sort(function(a, b) {
                return (new Date(a.album.release_date) > new Date(b.album.release_date));
            });
            tracksToAdd.push(mostPopular[0]);
        }
    }
}

function findTopTracks(artistIds, tracksToAdd, token) {
    let promises = [];
    for(let i = 0; i < artistIds.length; ++i) {
        promises.push(new Promise(function(resolve, reject) {
            $.ajax({
                url: "https://api.spotify.com/v1/artists/" + artistIds[i] + "/top-tracks?country=US",
                headers: {
                    'Authorization': 'Bearer ' + token,
                },
                success: function(response) {
                    let mostPopular = [];
                    getMostPopularTopTracks(response.tracks, mostPopular);
                    findBestTrack(mostPopular, tracksToAdd);
                    resolve();
                }
            });
        }));
    }
    return Promise.all(promises);
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

function generatePlaylist(artistsToAdd, user, token, playlistName) {
    let tracksToAdd = [];
    let promises = [];
    let artistIds = [];
    let playlist;

    promises.push(createEmptyPlaylist(user, token, playlistName));
    for(let i = 0; i < artistsToAdd.length; ++i) {
        promises.push(getArtistId(artistsToAdd[i], token, artistIds));
    }
    Promise.all(promises).then(function(resolves) {
        playlist = resolves[0];
        return findTopTracks(artistIds, tracksToAdd, token);
    }).then(function() {
        let trackIds = tracksToAdd.map(function(track){
            return track.uri;
        });
        console.log('here');
        return addTracksToPlaylist(trackIds, playlist.id, user, token)
    }).then(function() {
        console.log("all done");
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
    const playlistPage = $("#playlist-entry-page");
    const form = playlistPage.find("#playlist-form");
    const input = form.children("#playlist-entry");
    const alert = $("#alert");
    const statsPage = $("#stats-page");
    const recPage = $("#recommendation-page");
    const topArtists = statsPage.find("#top-artists");
    const topGenres = statsPage.find("#top-genres");
    const artistRecList = recPage.find("#artist-recs");
    const pageHeader = $("#page-header");
    const pageText = $("#page-text");
    let playlists;
    let user;
    let token;
    let artistPrevalence;
    let genrePrevalence = {};
    let artistOrder;
    let genreOrder;
    let stats_loaded = false;
    let recs_loaded = false;
    let tracks = [];
    let artistRecs = {};
    let artistsToAdd = [];

    let url_check = window.location.href.match(url_re);
    if(url_check != null) {
        switchPage($("#prelogin-page"), playlistPage);
        token = url_check[1];
        input.focus();
        playlistPromise = collectAllPlaylists(token, playlists);
        playlistPromise.then(function(result) {
            playlists = result;
        });
    }

    $("#login-btn").click(function() {
        window.location.href = "https://accounts.spotify.com/authorize?client_id=73df06c4d237418197bc43d50f729c0f&response_type=token&scope=playlist-modify-public&redirect_uri=http://localhost:5500/&show_dialog=true";
    });

    function switchToStatsPage() {
        pageText.removeClass("constrain-text");
        pageText.addClass("fullpage-text");
        pageHeader.addClass("hidden");
        switchPage(playlistPage, statsPage);
    }

    function insertTopArtists(tracks) {
        let template = ``;

        artistOrder = Object.keys(artistPrevalence).sort(function(a, b) {
            return artistPrevalence[b].count - artistPrevalence[a].count;
        });
        for(let i = 0; i < artistOrder.length && i <= 10; ++i) {
            template += `<li class="top-artist">${artistPrevalence[artistOrder[i]].display_name} (${(artistPrevalence[artistOrder[i]].count/tracks.length * 100).toFixed(2)}%)</li>`;
        }
        topArtists.find(".loading").remove();
        topArtists.append(template);
    }

    function insertTopGenres(tracks) {
        let template = ``;

        genreOrder = Object.keys(genrePrevalence).sort(function(a, b) {
            return genrePrevalence[b] - genrePrevalence[a];
        });
        for(let i = 0; i < genreOrder.length && i <= 10; ++i) {
            template += `<li class="top-genre">${genreOrder[i]} (${(genrePrevalence[genreOrder[i]]/tracks.length * 100).toFixed(2)}%)</li>`;
        }
        topGenres.find(".loading").remove();
        topGenres.append(template);
        stats_loaded = true;
    }

    function handleStatistics(user, playlist) {
        switchToStatsPage();
        let trackPromise = collectAllTracks(user, playlist, token, tracks);
        trackPromise.then(function(track_blocks) {
            for(let i = 0; i < track_blocks.length; ++i) {
                tracks = tracks.concat(track_blocks[i]);
            }
            artistPrevalence = getArtistPrevalence(tracks);
            //console.log(artistPrevalence);
            insertTopArtists(tracks);
            let genrePromise = getGenrePrevalence(artistPrevalence, token, genrePrevalence);
            genrePromise.then(function() {
                insertTopGenres(tracks);
            });
        });

    }


    function insertArtistRecs(artistRecs) {
        let template = ``;
        let recOrder = Object.keys(artistRecs).sort(function(a, b) {
            return artistRecs[b].match - artistRecs[a].match;
        });
        for(let i = 0; i < recOrder.length && i <= 50; ++i) {
            let sortedRecs = artistRecs[recOrder[i]].similarTo.sort(function(a, b) {
                return b.similarity - a.similarity;
            });
             
            template += `<li class="artist-rec"><strong class="rec-name">${recOrder[i]}</strong> <span class="rec-info hidden">(similar to: `;
            for(let j = 0; j < sortedRecs.length; ++j) {
                let sim = sortedRecs[j].similarity;
                let simClass = chooseSimClass(sim);      
                template += `<span class="${simClass}">${sortedRecs[j].name}</span>, `
            }
            template = template.slice(0, -2);
            template += `)</span></li>`
        }
        artistRecList.find(".loader").remove();
        artistRecList.append(template);
    }
    
    function handleRecommendations() {
        
        let artistRecPromise = collectArtistRecs(artistPrevalence, token, artistRecs);
        artistRecPromise.then(function() {
            //console.log(artisRecs);
            insertArtistRecs(artistRecs);
            recs_loaded = true;
        });
        //let genreRecs = collectGenreRecs(genrePrevalence);
    }

    form.on("submit", function(e) {
        e.preventDefault();
        let playlist = input.val();
        let playlistByName = findPlaylistWithName(playlists, playlist);
        if(playlistByName == null) 
            showAlert(alert, "Please enter a valid playlist name");
        else {
            user = playlistByName.owner.id;
            handleStatistics(user, playlistByName.id);
        }
    });
    
    statsPage.find("#recommendation-btn").click(function() {
        if(!stats_loaded) return;
        switchPage(statsPage, recPage);
        handleRecommendations();
       });

    recPage.on("mouseenter", "li", function() {
       // $(this).find(".rec-name").addClass("hidden");
        $(this).find(".rec-info").removeClass("hidden");
        $(this).find(".rec-info").css("opacity", "1");
    });
    recPage.on("mouseleave", "li", function() {
        $(this).find(".rec-info").css("opacity", "0");
        $(this).find(".rec-info").addClass("hidden");
    //    $(this).find(".rec-name").removeClass("hidden");
    });

    recPage.on("click", "li", function() {
        let name = $(this).find(".rec-name").text();
        if(artistRecs.hasOwnProperty(name)) {
            artistsToAdd.push(name);
        }
        $(this).remove();
    });

    recPage.find("#generate-playlist-btn").click(function() {
        if(!recs_loaded) return;
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

        generatePlaylist(artistsToAdd, user, token, playlistName);
        switchPage(recPage, $("#finish-page"));
    });
});