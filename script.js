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

async function collectAllPlaylists(token) {
    let playlists;
    await $.ajax({
        url: "https://api.spotify.com/v1/me/playlists",
        headers: {
            'Authorization': 'Bearer ' + token
        },
        success: function(response) {
            playlists = response.items;
        }
    });
    return playlists;
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
        if(prevalence[artist] == undefined)
            prevalence[artist] = {count: 1, artist_id: tracks[i].artist_id};
        else
            prevalence[artist].count++;
    } 
    return prevalence; 
}

function getLastfmGenres(artist, genrePrevalence, taglist) { // used if artist is not in spotify library
    return new Promise(function(resolve, reject) {
        $.ajax({
            url: "http://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&artist=" + artist + "&api_key=" + lastfm + "&format=json",
            success: function(response) {
                if(response.hasOwnProperty("error")) return;
                taglist = response.toptags.tag;
                for(let i = 0; i < taglist.length && i <= 5; ++i) {
                    if(genrePrevalence[taglist[i].name] == undefined)
                    genrePrevalence[taglist[i].name] = 1;
                    else
                    genrePrevalence[taglist[i].name]++;
                }
                resolve();
            }
        });
    });
}

function getSpotifyGenres(artist, artistPrevalence, taglist, promises, genrePrevalence, token) {
    return new Promise(function(resolve, reject) {
        $.ajax({
            url: "https://api.spotify.com/v1/artists/" + artistPrevalence[artist].artist_id,
            headers: {
                'Authorization': 'Bearer ' + token
            },
            success: function(response) {
                if(response.genres.length == 0) {
                    promises.push(getLastfmGenres(artist, genrePrevalence, taglist));
                }
                for(let i = 0; i < response.genres.length && i <= 5; ++i) {
                    artist_name = response.genres[i].toLowerCase();
                    if(genrePrevalence[artist_name] == undefined)
                        genrePrevalence[artist_name] = 1;
                    else
                        genrePrevalence[artist_name]++;
                }
                resolve();
            }
        });
    });
}

function getGenrePrevalence(artistPrevalence, token, genrePrevalence) {
    let taglist;
    let promises = [];
    for(let artist in artistPrevalence) {
        if(artistPrevalence[artist].artist_id == null) { 
            promises.push(getLastfmGenres(artist, genrePrevalence, taglist));
        }
        else {
            promises.push(getSpotifyGenres(artist, artistPrevalence, taglist, promises, genrePrevalence, token));
        }/*
        if(prevalence.hasOwnProperty("seen live"))
            prevalence["seen live"] = 0; //idk why this is a tag*/
    }
    return Promise.all(promises);
}

function getSpotifyRecs(artist, artistPrevalence, token, recname, recs) {
    return new Promise(function(resolve, reject) {
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
                        recs[recname].similarTo.push({name: artist, similarity: .7});
                    }
                    else {
                        if(artistPrevalence.hasOwnProperty(recname)) continue;
                        recs[recname] = {match: artistPrevalence[artist].count * .5, similarTo: [ {name: artist, similarity: .7} ] };
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
                            recs[recname].similarTo.push({name: artist, similarity: lastfmrecs[i].match});
                        }
                        else {
                            if(artistPrevalence.hasOwnProperty(recname)) continue; // user already listens to this artist
                            recs[recname] = { match: artistPrevalence[artist].count * lastfmrecs[i].match, similarTo: [{name: artist, similarity: lastfmrecs[i].match}] };
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
        //console.log(genre);
        $.ajax({
            url: "http://ws.audioscrobbler.com/2.0/?method=tag.getsimilar&tag=" + genre + "&api_key=" + lastfm + "&format=json",
            success: function(response) {
               // console.log(response);
            }
        });
    }
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

$(document).ready(async function() {
    const form = $("#playlist-form");
    const input = form.children("#playlist-entry");
    const alert = $("#alert");
    const preLogin = $("#pre-login");
    const statsPage = $("#stats-page");
    const recPage = $("#recommendation-page");
    const topArtists = statsPage.find("#top-artists");
    const topGenres = statsPage.find("#top-genres");
    const artistRecList = recPage.find("#artist-recs");
    const pageHeader = $("#page-header");
    const pageText = $("#page-text");
    let playlists;
    let token;
    let artistPrevalence;
    let genrePrevalence = {};
    let artistOrder;
    let genreOrder;
    let stats_loaded = false;
    let tracks = [];

    let url_check = window.location.href.match(url_re);
    if(url_check != null) {
        switchPage(preLogin, form);
        token = url_check[1];
        input.focus();
        playlists = await collectAllPlaylists(token);
    }

    $("#login-btn").click(function() {
        window.location.href = "https://accounts.spotify.com/authorize?client_id=73df06c4d237418197bc43d50f729c0f&response_type=token&redirect_uri=http://localhost:5500/&show_dialog=true";
    });

    function switchToStatsPage() {
        pageText.removeClass("constrain-text");
        pageText.addClass("fullpage-text");
        pageHeader.addClass("hidden");
        switchPage(form, statsPage);
    }

    function insertTopArtists(tracks) {
        let template = ``;

        artistOrder = Object.keys(artistPrevalence).sort(function(a, b) {
            return artistPrevalence[b].count - artistPrevalence[a].count;
        });
        for(let i = 0; i < artistOrder.length && i <= 10; ++i) {
            template += `<li class="top-artist">${artistOrder[i]} (${(artistPrevalence[artistOrder[i]].count/tracks.length * 100).toFixed(2)}%)</li>`;
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
        console.log(artistRecs);
        let template = ``;
        let recOrder = Object.keys(artistRecs).sort(function(a, b) {
            return artistRecs[b].match - artistRecs[a].match;
        });
        for(let i = 0; i < recOrder.length && i <= 10; ++i) {
            let similarNames = artistRecs[recOrder[i]].similarTo.sort(function(a, b) {
                return b.similarity - a.similarity;
             }).map(function(a) { return a.name });
            template += `<li class="artist-rec"><strong>${recOrder[i]}</strong> (similar to: ${similarNames.join(", ")})</li>`
        }
        artistRecList.find(".loader").remove();
        artistRecList.append(template);
    }
    
    function handleRecommendations() {
        let artistRecs = {};
        let artistRecPromise = collectArtistRecs(artistPrevalence, token, artistRecs);
        artistRecPromise.then(function() {
            //console.log(artistRecs);
            insertArtistRecs(artistRecs);
        });
        
        
        /*
        let genreRecs = collectGenreRecs(genrePrevalence);*/
    }

    form.on("submit", function(e) {
        e.preventDefault();
        let playlist = input.val();
        let playlistByName = findPlaylistWithName(playlists, playlist);
        if(playlistByName == null) 
            showAlert(alert, "Please enter a valid playlist name");
        else {
            handleStatistics(playlistByName.owner.id, playlistByName.id);
        }
    });
    
    $("#recommendation-btn").click(function() {
        if(!stats_loaded) return;
        switchPage(statsPage, recPage);
        handleRecommendations();
       });
});