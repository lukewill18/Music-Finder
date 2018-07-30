const lastfm = "69ea9630699c55e46ca0816adf440f44";

const validInput = new RegExp("^spotify:user:([a-zA-Z0-9]+?):playlist:([a-zA-Z0-9]+?)$");
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
            return playlists[i];
        }
    }
    return null;
}

async function collectAllTracks(user, playlist, token) { //REPEAT THIS UNTIL TRACKS HAS THE SONGS FROM THE WHOLE PLAYLSIT
    let tracks = [];
    let offset = 0;
    let total;
    let track;
    do {
        await $.ajax({
            url: "https://api.spotify.com/v1/users/" + user + "/playlists/" + playlist + "/tracks?offset=" + offset.toString(),
            headers: {
                'Authorization': 'Bearer ' + token
            },
            success: function(response) {
                total = response.total;
                for(let i = 0; i < response.items.length; ++i) {
                    track = response.items[i].track;
                    tracks.push({ "name": track.name, "artist": track.artists[0].name, "artist_id": track.artists[0].id});
                }
            }
        });
        offset += 100;
    }
    while(tracks.length < total);
    
    return tracks;
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

async function getGenrePrevalence(artistPrevalence) {
    let prevalence = {};
    let taglist;
    for(let artist in artistPrevalence) {
        await $.ajax({
            url: "http://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&artist=" + artist + "&api_key=" + lastfm + "&format=json",
            success: function(response) {
                if(response.hasOwnProperty("error")) return;
                taglist = response.toptags.tag;
                for(let i = 0; i < taglist.length && i <= 7; ++i) {
                    if(prevalence[taglist[i].name] == undefined)
                        prevalence[taglist[i].name] = 1;
                    else
                        prevalence[taglist[i].name]++;
                }
                prevalence["seen live"] = 0; //idk why this is a tag
            }
        });
    }
    return prevalence;
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
    const topArtists = statsPage.find("#top-artists");
    const topGenres = statsPage.find("#top-genres");
    const pageHeader = $("#page-header");
    const pageText = $("#page-text");
    let playlists;
    let token;
    let artistPrevalence;
    let genrePrevalence;
    let artistOrder;
    let genreOrder;

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
        artistOrder = Object.keys(artistPrevalence).sort(function(a, b) {
            return artistPrevalence[b].count - artistPrevalence[a].count;
        });
        for(let i = 0; i < artistOrder.length && i <= 10; ++i) {
            topArtists.append(`<li class="top-artist">${artistOrder[i]} (${(artistPrevalence[artistOrder[i]].count/tracks.length * 100).toFixed(2)}%)</li>`)
        }
        topArtists.find(".loading").remove();
    }

    function insertTopGenres(tracks) {
        genreOrder = Object.keys(genrePrevalence).sort(function(a, b) {
            return genrePrevalence[b] - genrePrevalence[a];
        });
        for(let i = 0; i < genreOrder.length && i <= 10; ++i) {
            topGenres.append(`<li class="top-genre">${genreOrder[i]} (${(genrePrevalence[genreOrder[i]]/tracks.length * 100).toFixed(2)}%)</li>`)
        }
        topGenres.find(".loading").remove();
    }

    async function handleStatistics(user, playlist) {
        switchToStatsPage();
        let tracks = await collectAllTracks(user, playlist, token);
        artistPrevalence = getArtistPrevalence(tracks);
        insertTopArtists(tracks);
        genrePrevalence = await getGenrePrevalence(artistPrevalence);
        insertTopGenres(tracks);
    }
    
    form.on("submit", async function(e) {
        e.preventDefault();
        let playlist = input.val();
        
        let matches = playlist.match(validInput);
        if(matches == null || matches.length < 3) {
            let playlistByName = findPlaylistWithName(playlists, playlist);
            if(playlistByName == null) 
                showAlert(alert, "Please enter a valid playlist name/URL(Right click playlist -> Share -> Copy Spotify URL)");
            else {
                handleStatistics(playlistByName.owner.id, playlistByName.id);
            }
        }
        else {    
            handleStatistics(matches[1], matches[2])
            //let lyrics = await collectAllLyrics(tracks);
        }
    });
});