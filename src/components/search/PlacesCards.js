import React from 'react';
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';
import Typography from '@material-ui/core/Typography';

class PlacesCard extends React.Component {
    constructor(props) {
        super(props);
        this.state = {};
    }
    render() {

        return (
            <div>
                <div>Places</div>
                {this.props.places.map(place => {
                    // startEndArray = verse.verseText.split(this.props.query);
                    return (
                        <Card key={"container" + place.slug}>
                            <CardContent>
                                <Typography>{place.name}</Typography>
                                <Typography>
                                    {place.verseCount + " verses. First mentioned in " + place.verses[0].fullRef}
                                </Typography>
                                    {/*
                                        <TypographyBold style={{ display: 'inline' }} Typography={" " + this.props.query + " "}></TypographyBold>
                                        <TypographyRegular style={{ display: 'inline' }} Typography={startEndArray[1]}></TypographyRegular>
                                    */}
                            </CardContent>
                        </Card>
                    )
                })}
            </div>
        );
    }
}

export default PlacesCard