import React from 'react';
import Grid from '@material-ui/core/Grid';
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';
import Typography from '@material-ui/core/Typography';
import { Link } from 'gatsby';

class VersesCards extends React.Component {

    render() {

        return (
            <Grid container 
            spacing={2}
            direction="column"
        >
                <Grid item>
                    <Typography variant="button" display="block" >Verses</Typography>
                </Grid>
                {this.props.verses.map(verse => {
                    // startEndArray = verse.verseText.split(this.props.query);
                    return (
                        <Grid item key={"container" + verse.verseId}>
                            <Card>
                                <CardContent>
                                    <Link to={'/' + verse.osisRef.toLowerCase().split('.')[0] + '/#' + verse.osisRef}>
                                        <Typography>{verse.fullRef}</Typography>
                                    </Link>
                                    <Typography>{verse.verseText}</Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                    )
                })}
            </Grid>
        );
    }
}

export default VersesCards