import { Selector } from 'testcafe';

fixture `Testing page`
   .page `http://localhost:5500/#access_token=BQC9YhZ3EnlT8mbZKg1mpXC3j6ejuYL7E5L-RjQnqowEMCjhAF7H-GUNeXBYJGSR9mFSsvGUOPRm96GRX0vc3yM8Ta1-LTADXW6QJHsEDRl2jCWaaweQHYYin6lsFebY26sVLrCpW-lffAcSf-KNzktuNTQeo1OYrKnM98aeMe3C0GIf_wkd&token_type=Bearer&expires_in=3600`;

async function test1() {
    test("Testing choosing a playlist and viewing stats page", async t=> {
        await t
            .click(".playlist-img")
        let h1 = Selector("#top-genres-header");
        let h2 = Selector("#top-artists-header");
        let tg = Selector("#top-genres");
        let ta = Selector("#top-artists");
        let tg_li = Selector(".top-genre");
        let ta_li = Selector(".top-artist");
        let ta_img = Selector(".top-artist-img");
        let ta_info = Selector(".top-artist-info");
        await t
            .expect(h1.exists).ok()
            .expect(h1.textContent).contains("Your Playlist's Top Genres")
            .expect(h2.exists).ok()
            .expect(h2.textContent).contains("Your Playlist's Top Artists")
            .expect(tg.exists).ok()
            .expect(ta.exists).ok()
            .expect(tg_li.count).eql(10)
            .expect(ta_li.count).eql(10)
            .expect(ta_img.count).eql(10)
            .expect(ta_info.count).eql(10)
    });
}

async function test2() {
    test("Testing recommendation page", async t => {
        let ar = Selector("#artist-recs");
        let rec = Selector(".artist-rec");
        let recCB = rec.find(".rec-checkbox");
        let name1 = Selector(".rec-name");
        let art = Selector("#art0");
        await t
            .click(".playlist-img")
            .click("#recommendation-btn")
            .expect(ar.exists).ok()
            .expect(rec.count).eql(31)
            .expect(art.hasClass("hidden")).ok()
            .click(name1)
        let modal_info = Selector("#info0", {visibilityCheck: true});
        let modalcontainer = Selector("#rec-modal-container");
        let h2 = await modal_info.find("h2");
        let genres = await modal_info.find(".rec-genre-list");
        let preview = await modal_info.find(".preview-clip");
        let img = await modal_info.find(".artist-img");
        let st = await modal_info.find(".similar-to");
        let name = name1.textContent;
        
        await t
        //.expect(h2.textContent).contains(name)
            .expect(art.exists).ok()
            .expect(genres.exists).ok()
            .expect(preview.exists).ok()
            .expect(img.exists).ok()
            .expect(st.exists).ok()
            .click(modalcontainer)
            .hover(name1)
            .expect(art.hasClass("hidden")).notOk()
    });
}

//test1();
test2();