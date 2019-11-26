import React from 'react';
import Grid from '@material-ui/core/Grid';
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
            <Grid container 
                spacing={2}
                direction="column"
            >
                <Grid item>
                    <Typography variant="button" display="block" >Places</Typography>
                </Grid>

                {this.props.places.map(place => {
                    // startEndArray = verse.verseText.split(this.props.query);
                    return (
                        <Grid item>
                            <Card key={"container" + place.slug}>
                                <CardContent>
                                    <Typography>{place.name}</Typography>
                                    <Typography>
                                        {place.verseCount + " verses. First mentioned in " + place.verses[0].fullRef}
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                    )
                })}
            </Grid>
        );
    }
}

export default PlacesCard