function showAlert(alert, message) {
    showing_alert = true;
    alert.text(message);
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