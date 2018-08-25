const lastfm = "69ea9630699c55e46ca0816adf440f44";
let CancelToken = axios.CancelToken;
let source = CancelToken.source();
let cancelTrackRequest;
let storage_full = false;

function collectAllPlaylists(token, alert) {
    return new Promise(function(resolve, reject) {
        $.ajax({
            url: "https://api.spotify.com/v1/me/playlists",
            headers: {
                'Authorization': 'Bearer ' + token
            },
            success: function(response) {
                resolve(response.items);
            },
            error: function(response) {
                if(response.status == 401) {
                    window.location.hash = ""
                    showAlert(alert, "Session Expired");
                }
                else {
                    setTimeout(function() {
                        let retry = collectAllPlaylists(token, alert);
                        retry.then(function(items) {
                            resolve(items);
                        });
                    }, 3000);
                }
            }
        });
    });
}

function makeTrackRequest(user, playlist, offset, token, tracks, alert) {
    return new Promise(function(resolve, reject) {
        axios({
            url: "https://api.spotify.com/v1/users/" + user + "/playlists/" + playlist + "/tracks?offset=" + offset.toString(),
            headers: {
                'Authorization': 'Bearer ' + token
            },
            cancelToken: new CancelToken(function executor(c) {
                cancelTrackRequest = c;
            })
        }).then(function(response) {
            response = response.data;
            let relevant = response.items.map(function(i) {
                return {"name": i.track.name, "artist": i.track.artists[0].name, "artist_id": i.track.artists[0].id, "images": i.track.album.images};
            });
            tracks = tracks.concat(relevant);
            resolve(tracks);
        }).catch(function(thrown) {
            if(axios.isCancel(thrown))
                reject("cancelled");
            else {
                if(thrown.response.status == 401) {
                    window.location.hash = "";
                    showAlert(alert, "Session Expired");
                }
                else {
                    setTimeout(function() {
                        let retry = makeTrackRequest(user, playlist, offset, token, tracks, alert);
                        retry.then(function() {
                            resolve(tracks);
                        })
                    }, 3000);     
                }
            }
        });
    });
}

function getArtistImage(artist) {
    return new Promise(function(resolve, reject) {
        $.ajax({
            url: "https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=" + artist + "&api_key=" + lastfm + "&format=json",
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
        axios({
            url: "https://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&artist=" + artist + "&api_key=" + lastfm + "&format=json",
            cancelToken: new CancelToken(function executor(c) {
                cancelTrackRequest = c;
            })
        }).then(function(response) {
            response = response.data;
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
        }).catch(function(thrown) {
            if(axios.isCancel(thrown)) {
                reject("cancelled");
            }
        });
    });
}

function getSpotifyGenres(artists_with_id, artistPrevalence, promises, genrePrevalence, token, alert) {
    let artist_ids = artists_with_id.map(function(i) {
        return artistPrevalence[i].artist_id;
    }).join(",");
    let genres;
    let genre_name;
    return new Promise(function(resolve, reject) {
        axios({
            url: "https://api.spotify.com/v1/artists?ids=" + artist_ids,
            headers: {
                'Authorization': 'Bearer ' + token
            }
        }).then(function(response) {
            response = response.data;
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
        }).catch(function(thrown) {
            if(axios.isCancel(thrown)) {
                reject("cancelled");
            }
            else {
                if(thrown.response.status == 401) {
                    window.location.hash = "";
                    showAlert(alert, "Session Expired");
                }
                else {
                    setTimeout(function() {
                        let retry = getSpotifyGenres(artists_with_id, artistPrevalence, promises, genrePrevalence, token, alert);
                        retry.then(function() {
                            resolve();
                        });
                    }, 3000);
                }
            }
        });
    });
}

function setLastfmGenres(recs, artist) {
    return new Promise(function(resolve, reject) {
        $.ajax({
            url: "https://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&artist=" + artist + "&api_key=" + lastfm + "&format=json",
            success: function(response) {
                if(response.hasOwnProperty("error")) {
                    resolve();
                    return;
                }
                let tags = response.toptags.tag;
                recs[artist].genres = tags.slice(0, 10).map(function(t) {
                    return t.name;
                });
                resolve();
            }
        });
    });
}

function setLastfmArt(recs, artist) {
    return new Promise(function(resolve, reject) {
        $.ajax({
            url: "https://ws.audioscrobbler.com/2.0/?method=artist.gettopalbums&artist=" + artist + "&api_key=" + lastfm + "&format=json",
            success: function(response) {
                if(response.hasOwnProperty("error")) {
                    recs[artist].album_art.push("http://www.emoji.co.uk/files/microsoft-emojis/symbols-windows10/10176-white-question-mark-ornament.png");
                    resolve();
                    return;
                }
                let topalbum = response.topalbums.album[0];
                let art;
                if(topalbum == undefined || topalbum.image[3]["#text"] == "")
                    art = "http://www.emoji.co.uk/files/microsoft-emojis/symbols-windows10/10176-white-question-mark-ornament.png";
                else  
                    art = topalbum.image[3]["#text"];
                recs[artist].album_art.push(art);
                resolve();
            }
        });
    });
}

function setAnyArt(spotify_id, token, recs, artist, alert) {
    return new Promise(function(resolve, reject) {
        $.ajax({
            url: "https://api.spotify.com/v1/artists/" + spotify_id + "/albums",
            headers: {
                'Authorization': 'Bearer ' + token,
            },
            success: function(response) {
                for(let i = 0; i < response.items.length; ++i) {
                    if(response.items[i].images.length > 0) {
                        let img = response.items[i].images[0].url;
                        recs[artist].album_art.push(img);
                    }
                }
                resolve();
            },
            error: function(response) {
                if(response.status == 401) {
                    window.location.hash = ""
                    showAlert(alert, "Session Expired");
                }
                else {
                    setTimeout(function() {
                        let retry = setAnyArt(spotify_id, token, recs, artist, alert);
                        retry.then(function() {
                            resolve();
                        });
                    }, 3000);
                }
            }
        });
    });
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

function setAlbumArt(spotify_id, token, recs, artist, alert) {
    return new Promise(function(resolve, reject) {
        $.ajax({
            url: "https://api.spotify.com/v1/artists/" + spotify_id + "/albums?include_groups=album&limit=50",
            headers: {
                'Authorization': 'Bearer ' + token,
            },
            success: function(response) {
                if(response.items.length == 0) {
                    let p = setAnyArt(spotify_id, token, recs, artist, alert);
                    p.then(function() {
                        resolve();
                    });
                }
                else {
                    let no_duplicates = filterDuplicateAlbums(response.items);
                    for(let i = 0; i < no_duplicates.length; ++i) {
                        if(no_duplicates[i].images.length > 0) {
                            let img = no_duplicates[i].images[0].url;
                            recs[artist].album_art.push(img);
                        }
                    }
                    resolve();
                }
            },
            error: function(response) {
                if(response.status == 401) {
                    window.location.hash = ""
                    showAlert(alert, "Session Expired");
                }
                else {
                    setTimeout(function() {
                        let retry = setAlbumArt(spotify_id, token, recs, artist, alert);
                        retry.then(function() {
                            resolve();
                        });
                    }, 3000);
                }
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

function setTopTrack(spotify_id, token, recs, artist, alert) {
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
                if(response.status == 401) {
                    window.location.hash = ""
                    showAlert(alert, "Session Expired");
                }
                else {
                    setTimeout(function() {
                        let retry = setTopTrack(spotify_id, token, recs, artist, alert);
                        retry.then(function(sid) {
                            resolve(sid);
                        });
                    }, 3000);
                }   
            }
        });
    });
}

function getMostListenedArtists(num_artists, time_range, token, alert) {
    return new Promise(function(resolve, reject) {
        $.ajax({
            url: "https://api.spotify.com/v1/me/top/artists?limit=" + num_artists.toString() + "&time_range=" + time_range.id,
            headers: { "Authorization": "Bearer " + token },
            success: function(response) {
                resolve(response.items);
            },
            error: function(response) {
                if(response.status == 401) {
                    window.location.hash = ""
                    showAlert(alert, "Session Expired");
                }
                else {
                    setTimeout(function() {
                        let retry = getMostListenedArtists(num_artists, time_range, token, alert);
                        retry.then(function(items) {
                            resolve(items);
                        });
                    }, 3000);
                }
            }
        });
    });
}

function getMostListenedUserID(token, alert) {
    return new Promise(function(resolve, reject) {
        $.ajax({
            url: "https://api.spotify.com/v1/me",
            headers: { "Authorization": "Bearer " + token },
            success: function(response) {
                resolve(response.id);
            },
            error: function(response) {
                if(response.status == 401) {
                    window.location.hash = ""
                    showAlert(alert, "Session Expired");
                }
                else {
                    setTimeout(function() {
                        let retry = getMostListenedUserID(token, alert);
                        retry.then(function(id) {
                            resolve(id);
                        });
                    }, 3000);
                }
            }
        });
    });
}

function getSpotifyRecs(artist, artistPrevalence, token, recname, recs, alert) {
    return new Promise(function(resolve, reject) {
        if(artistPrevalence[artist].artist_id == null) {
            resolve();
            return;
        }
        axios({
            url: "https://api.spotify.com/v1/artists/" + artistPrevalence[artist].artist_id + "/related-artists",
            headers: {
                'Authorization': 'Bearer ' + token
            },
            cancelToken: source.token
        }).then(function(response) {
            response = response.data;
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
        }).catch(function(thrown) {
            if(axios.isCancel(thrown)) {
                reject("cancelled");
            }
            else {
                if(thrown.response.status == 401) {
                    window.location.hash = "";
                    showAlert(alert, "Session Expired");
                }
                else {
                    setTimeout(function() {
                        let retry = getSpotifyRecs(artist, artistPrevalence, token, recname, recs, alert);
                        retry.then(function() {
                            resolve();
                        });
                    }, 3000);
                }
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
            let pic = images[4]["#text"] != "" ? images[4]["#text"] : "http://www.emoji.co.uk/files/microsoft-emojis/symbols-windows10/10176-white-question-mark-ornament.png";
            recs[recname] = { match: artistPrevalence[artist].count * lastfmrecs[i].match, 
                similarTo: [{name: artistPrevalence[artist].display_name, similarity: lastfmrecs[i].match}], info_id: null,
                art_id: null, image: pic, spotify_id: null, genres: [], top_track: null, album_art: []};
        }                       
    }
}

function getLastfmRecs(artist, artistPrevalence, token, recname, recs, promises, alert) {
    return new Promise(function(resolve, reject) {
        let cached = sessionStorage.getItem(artist);
        if(cached != null) {
            let response = JSON.parse(cached);
            updateRecsLastfm(artist, artistPrevalence, response.recommendations, recs);
            resolve();
        }
        else {
            axios({
                url: "https://ws.audioscrobbler.com/2.0/?method=artist.getsimilar&artist=" + artist + "&api_key=" + lastfm + "&format=json",
                cancelToken: source.token
            }).then(function(response) {
                response = response.data;
                if(response.hasOwnProperty("error")) {
                    promises.push(getSpotifyRecs(artist, artistPrevalence, token, recname, recs, alert));
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
            }).catch(function(thrown) {
                if(axios.isCancel(thrown)) {
                    reject("cancelled");
                }
            });
        }
    });
}

function createEmptyPlaylist(user, token, playlistName, namesWithoutTrack, alert) {
    let desc = "Tracks from artists recommended by Music Finder";
    if(namesWithoutTrack.length > 0) {
        desc += ". The following artist(s) were not added because they could not be found on Spotify: " + namesWithoutTrack.join(", ");
    }

    let json_string = JSON.stringify({
        "name": playlistName,
        "description": desc
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
            },
            error: function(response) {
                if(response.status == 401) {
                    window.location.hash = ""
                    showAlert(alert, "Session Expired");
                }
                else {
                    setTimeout(function() {
                        let retry = createEmptyPlaylist(user, token, playlistName, namesWithoutTrack, alert);
                        retry.then(function(p) {
                            resolve(p);
                        });
                    }, 3000);
                }
            }
        });
    });
}

function addTracksToPlaylist(trackids, playlist, user, token, alert) {
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
                },
                error: function(response) {
                    if(response.status == 401) {
                        window.location.hash = ""
                        showAlert(alert, "Session Expired");
                    }
                    else {
                        setTimeout(function() {
                            let retry = addTracksToPlaylist(trackids, playlist, user, token, alert);
                            retry.then(function() {
                                resolve();
                            });
                        }, 3000);
                    }
                }
            });
        }));
    }
    return Promise.all(promises);
}