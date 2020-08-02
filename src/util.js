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

function findPlaylistWithName(playlists, name) {
    for(let i = 0; i < playlists.length; ++i) {
        if(playlists[i].name == name) {
            totalTracks = playlists[i].tracks.total;
            return playlists[i];
        }
    }
    return null;
}

function collectAllTracks(user, playlist, token, tracks, alert) { 
    let offset = 0;
    let promises = [];
    do {
        promises.push(makeTrackRequest(user, playlist, offset, token, tracks, alert));
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

function getMostListenedArtistPrevalence(most_listened) {
    let increment = Math.ceil(most_listened.length / 10);
    let prevalence = {};
    for(let i = 0; i < most_listened.length; ++i) {
        if(i > 0 && i % 10 == 0)
            --increment; // each 10 less listened artists are weighted 1 lower
        let artist_lower = most_listened[i].name.toLowerCase();
        prevalence[artist_lower] = {count: increment, artist_id: most_listened[i].id, display_name: most_listened[i].name, album_art: []};
    }
    return prevalence;
}

function getGenrePrevalence(artistPrevalence, token, genrePrevalence, alert) {
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
        promises.push(getSpotifyGenres(artists_with_id.slice(i, i + 50), artistPrevalence, promises, genrePrevalence, token, alert));
    }
    return Promise.all(promises);
}

function findMatchingArtist(items, artist, searchname) {
    let match = items[0];
    if(match.name != artist && match.name != searchname) {
        let try_again = items.find(function(a) {
            return a.name == artist;
        });
        if(try_again != undefined) 
            match = try_again;
    }
    for(let i = 0; i < items.length; ++i) {
        if(items[i].name == artist) {
            match = items[i];
            break;
        }
    }
    return match;
}

function setIDAndGenres(searchname, token, recs, artist, alert) {
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
                let match = findMatchingArtist(response.artists.items, artist, searchname);
                recs[artist].spotify_id = match.id;
                if(match.genres.length > 0) 
                {
                    recs[artist].genres = match.genres;
                    resolve(recs[artist].spotify_id);
                }
                else {
                    let p = setLastfmGenres(recs, artist);
                    p.then(function() {
                        resolve(recs[artist].spotify_id);
                    });
                }
            },
            error: function(response) {
                if(response.status == 401) {
                    window.location.hash = ""
                    showAlert(alert, "Session Expired");
                }
                else {
                    setTimeout(function() {
                        let retry = setIDAndGenres(searchname, token, recs, artist, alert);
                        retry.then(function() {
                            resolve();
                        })
                    }, 3000);
                }
            }
        }); 
    });
}

function getAdditionalArtistInfo(artist, token, recs, alert) { 
    let searchname = artist.split(" ")[0].toLowerCase() == "the" ?  artist.slice(4) : artist;
    return new Promise(function(resolve, reject) {
        let p1 = setIDAndGenres(searchname, token, recs, artist, alert);
        p1.catch(function(msg) {
            reject(msg);
        });
        p1.then(function(spotify_id) {
            if(spotify_id == undefined) {
                let alt_promises = [];
                alt_promises.push(setLastfmGenres(recs, artist));
                alt_promises.push(setLastfmArt(recs, artist));
                Promise.all(alt_promises).then(function() {
                    resolve();
                });
            }
            else {
                let p2 = setTopTrack(spotify_id, token, recs, artist, alert);
                p2.catch(function(msg) {
                    reject(msg);
                });
                p2.then(function(spotify_id) {
                    if(spotify_id == undefined) {
                        resolve();
                    }
                    else {
                        let p3 = setAlbumArt(spotify_id, token, recs, artist, alert);
                        p3.catch(function(msg) {
                            reject(msg);
                        });
                        p3.then(function() {
                            let p4 = setArtistImage(spotify_id, token, recs, artist, alert);
                            p4.then(function() {
                                resolve();
                            });
                        });
                    }
                });
            }
        });
    });
}

function collectArtistRecs(artistPrevalence, token, recs, alert) {
    let recname;
    let promises = [];
    for(let artist in artistPrevalence) {
        promises.push(getLastfmRecs(artist, artistPrevalence, token, recname, recs, promises, alert));
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

function generatePlaylist(artistsToAdd, user, token, playlistName, artistRecs, alert) {
    let tracksToAdd = artistsToAdd.map(function(i) {
        return {name: i, track: artistRecs[i].top_track};
    });
    let playlist;
    let url;

    let trackIds = tracksToAdd.filter(function(obj){
        return obj.track != null;
    }).map(function(obj) {
        return obj.track.uri;
    });

    let namesWithoutTrack = tracksToAdd.filter(function(obj) {
        return obj.track == null;
    }).map(function(obj) {
        return obj.name;
    });

    let p1 = createEmptyPlaylist(user, token, playlistName, namesWithoutTrack, alert);
    return new Promise(function(resolve, reject) {
        p1.then(function(resolve) {
            playlist = resolve;
            return addTracksToPlaylist(trackIds, playlist.id, user, token, alert);
        }).then(function() {
            url = playlist.external_urls.spotify;
            resolve(url);
        });
    });
}
